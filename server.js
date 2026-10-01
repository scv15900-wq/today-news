import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, "dist")));

let cachedNews = null;
let cachedAt = 0;

// 뉴스 캐시: 30분
const CACHE_TIME = 30 * 60 * 1000;

// GNews 요청 사이 간격
const REQUEST_DELAY = 1500;

// 429 발생 시 재시도 대기시간
const RETRY_DELAY = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------
   기사 데이터 정리
------------------------- */

function makeNewsItem(article, category, id) {
  return {
    id,
    title: article.title || "제목 없음",
    summary: article.description || "요약 정보가 없습니다.",
    category,
    source: article.source?.name || "뉴스 출처",
    url: article.url || "",
    image: article.image || null,
    publishedAt: article.publishedAt || null,
  };
}

/* -------------------------
   GNews 실제 요청
------------------------- */

async function fetchFromGNews(endpoint, params, categoryName) {
  const apiKey = process.env.GNEWS_API_KEY;

  const searchParams = new URLSearchParams({
    ...params,
    lang: "ko",
    country: "kr",
    max: "10",
    apikey: apiKey,
  });

  const url =
    `https://gnews.io/api/v4/${endpoint}?` +
    searchParams.toString();

  try {
    let response = await fetch(url);

    // 너무 빠른 요청이면 한 번 기다렸다가 재시도
    if (response.status === 429) {
      console.log(
        `[${categoryName}] 요청 제한 발생 - 5초 후 재시도`
      );

      await sleep(RETRY_DELAY);

      response = await fetch(url);
    }

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `[${categoryName}] GNews 오류`,
        response.status,
        errorText
      );

      return [];
    }

    const data = await response.json();

    if (!Array.isArray(data.articles)) {
      return [];
    }

    console.log(
      `[${categoryName}] ${data.articles.length}개 가져옴`
    );

    return data.articles;
  } catch (error) {
    console.error(
      `[${categoryName}] 요청 실패:`,
      error.message
    );

    return [];
  }
}

/* -------------------------
   GNews 카테고리 요청
------------------------- */

async function fetchCategory(
  gnewsCategory,
  appCategory
) {
  return fetchFromGNews(
    "top-headlines",
    {
      category: gnewsCategory,
    },
    appCategory
  );
}

/* -------------------------
   정치 / 사회 검색
------------------------- */

async function fetchSearch(
  query,
  appCategory
) {
  return fetchFromGNews(
    "search",
    {
      q: query,
      sortby: "publishedAt",
    },
    appCategory
  );
}

/* -------------------------
   전체 뉴스 가져오기
------------------------- */

async function getNews() {
  if (!process.env.GNEWS_API_KEY) {
    throw new Error(
      "GNEWS_API_KEY가 설정되지 않았습니다."
    );
  }

  const news = [];
  let id = 1;

  /*
    중요:
    Promise.all을 사용하지 않는다.

    카테고리를 하나씩 순서대로 요청해서
    GNews에 동시에 요청이 몰리는 것을 줄인다.
  */

  const requests = [
    {
      name: "정치",
      load: () =>
        fetchSearch(
          "정치 OR 대통령 OR 국회 OR 정부 OR 정당",
          "정치"
        ),
    },

    {
      name: "경제",
      load: () =>
        fetchCategory(
          "business",
          "경제"
        ),
    },

    {
      name: "사회",
      load: () =>
        fetchSearch(
          "사회 OR 사건 OR 사고 OR 경찰 OR 법원",
          "사회"
        ),
    },

    {
      name: "IT",
      load: () =>
        fetchCategory(
          "technology",
          "IT"
        ),
    },

    {
      name: "국제",
      load: () =>
        fetchCategory(
          "world",
          "국제"
        ),
    },

    {
      name: "스포츠",
      load: () =>
        fetchCategory(
          "sports",
          "스포츠"
        ),
    },

    {
      name: "연예",
      load: () =>
        fetchCategory(
          "entertainment",
          "연예"
        ),
    },

    {
      name: "과학",
      load: () =>
        fetchCategory(
          "science",
          "과학"
        ),
    },

    {
      name: "생활",
      load: () =>
        fetchCategory(
          "health",
          "생활"
        ),
    },
  ];

  for (let i = 0; i < requests.length; i++) {
    const request = requests[i];

    console.log(
      `[${request.name}] 뉴스 요청 중...`
    );

    const articles = await request.load();

    const seenUrls = new Set();

    let added = 0;

    for (const article of articles) {
      if (added >= 10) {
        break;
      }

      if (!article.url) {
        continue;
      }

      if (seenUrls.has(article.url)) {
        continue;
      }

      seenUrls.add(article.url);

      news.push(
        makeNewsItem(
          article,
          request.name,
          id
        )
      );

      id += 1;
      added += 1;
    }

    console.log(
      `[${request.name}] 최종 ${added}개 저장`
    );

    // 마지막 요청 뒤에는 기다릴 필요 없음
    if (i < requests.length - 1) {
      await sleep(REQUEST_DELAY);
    }
  }

  console.log("----------------------");

  const categoryNames = [
    "정치",
    "경제",
    "사회",
    "IT",
    "국제",
    "스포츠",
    "연예",
    "과학",
    "생활",
  ];

  for (const category of categoryNames) {
    const count = news.filter(
      (item) => item.category === category
    ).length;

    console.log(
      `${category}: ${count}개`
    );
  }

  console.log(
    `전체 뉴스: ${news.length}개`
  );

  console.log("----------------------");

  return news;
}

/* -------------------------
   뉴스 API
------------------------- */

app.get("/api/news", async (req, res) => {
  try {
    const now = Date.now();

    // 30분 동안은 GNews를 다시 호출하지 않음
    if (
      cachedNews &&
      now - cachedAt < CACHE_TIME
    ) {
      console.log("캐시 뉴스 사용");

      return res.json(cachedNews);
    }

    const news = await getNews();

    if (news.length > 0) {
      cachedNews = news;
      cachedAt = now;

      return res.json(news);
    }

    // 새 요청이 전부 실패했지만
    // 기존 캐시가 있다면 기존 뉴스 반환
    if (cachedNews) {
      return res.json(cachedNews);
    }

    return res.status(503).json({
      error:
        "현재 뉴스 데이터를 가져올 수 없습니다.",
    });
  } catch (error) {
    console.error(
      "뉴스 서버 오류:",
      error
    );

    if (cachedNews) {
      return res.json(cachedNews);
    }

    return res.status(500).json({
      error:
        "뉴스를 가져오는 중 오류가 발생했습니다.",
    });
  }
});

/* -------------------------
   React 앱
------------------------- */

app.use((req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "dist",
      "index.html"
    )
  );
});

/* -------------------------
   서버 시작
------------------------- */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `뉴스 서버 실행: ${PORT}`
    );
  }
);