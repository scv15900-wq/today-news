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

let cachedNews = [];
let isRefreshing = false;

// 3시간마다 뉴스 갱신
const REFRESH_TIME = 3 * 60 * 60 * 1000;

const REQUEST_DELAY = 1500;
const RETRY_DELAY = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeNewsItem(article, category, id) {
  return {
    id,
    title: article.title || "제목 없음",
    summary:
      article.description || "요약 정보가 없습니다.",
    category,
    source: article.source?.name || "뉴스 출처",
    url: article.url || "",
    image: article.image || null,
    publishedAt: article.publishedAt || null,
  };
}

async function fetchFromGNews(gnewsCategory, name) {
  const apiKey = process.env.GNEWS_API_KEY;

  const params = new URLSearchParams({
    category: gnewsCategory,
    lang: "ko",
    country: "kr",
    max: "10",
    apikey: apiKey,
  });

  const url =
    "https://gnews.io/api/v4/top-headlines?" +
    params.toString();

  try {
    let response = await fetch(url);

    if (response.status === 429) {
      console.log(
        `[${name}] 요청 제한 - 5초 후 재시도`
      );

      await sleep(RETRY_DELAY);
      response = await fetch(url);
    }

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `[${name}] GNews 오류`,
        response.status,
        errorText
      );

      return [];
    }

    const data = await response.json();

    const articles = Array.isArray(data.articles)
      ? data.articles
      : [];

    console.log(
      `[${name}] ${articles.length}개 가져옴`
    );

    return articles;
  } catch (error) {
    console.error(
      `[${name}] 요청 실패:`,
      error.message
    );

    return [];
  }
}

const politicalKeywords = [
  "대통령",
  "국회",
  "정부",
  "여당",
  "야당",
  "정당",
  "의원",
  "장관",
  "총리",
  "청와대",
  "대통령실",
  "선거",
  "정치",
];

const societyKeywords = [
  "경찰",
  "검찰",
  "법원",
  "재판",
  "사건",
  "사고",
  "화재",
  "범죄",
  "구속",
  "체포",
  "수사",
  "기소",
  "판결",
  "신고",
  "실종",
  "사망",
  "부상",
  "피해",
  "폭행",
  "살인",
  "사기",
  "마약",
  "교통사고",
  "재난",
  "구조",
  "소방",
  "교육",
  "학교",
  "학생",
  "교사",
  "대학",
  "노동",
  "근로",
  "노조",
  "취업",
  "고용",
  "복지",
  "주거",
  "아파트",
  "병원",
  "의료",
  "사회",
];

const lifeKeywords = [
  "날씨",
  "기온",
  "비",
  "눈",
  "폭염",
  "한파",
  "태풍",
  "미세먼지",
  "황사",
  "건강",
  "질병",
  "감염",
  "독감",
  "코로나",
  "백신",
  "병원",
  "의료",
  "식품",
  "음식",
  "먹거리",
  "요리",
  "외식",
  "여행",
  "관광",
  "축제",
  "문화",
  "공연",
  "전시",
  "영화",
  "교통",
  "지하철",
  "버스",
  "철도",
  "고속도로",
  "주택",
  "주거",
  "아파트",
  "부동산",
  "물가",
  "가격",
  "소비",
  "할인",
  "마트",
  "생활",
];

function containsKeyword(article, keywords) {
  const text = [
    article.title || "",
    article.description || "",
  ]
    .join(" ")
    .toLowerCase();

  return keywords.some((keyword) =>
    text.includes(keyword.toLowerCase())
  );
}

function removeExactDuplicates(articles) {
  const result = [];
  const urls = new Set();

  for (const article of articles) {
    if (!article.url) {
      continue;
    }

    if (urls.has(article.url)) {
      continue;
    }

    urls.add(article.url);
    result.push(article);
  }

  return result;
}

async function getNews() {
  if (!process.env.GNEWS_API_KEY) {
    throw new Error(
      "GNEWS_API_KEY가 설정되지 않았습니다."
    );
  }

  const categoryRequests = [
    {
      gnews: "general",
      app: "종합후보",
    },
    {
      gnews: "business",
      app: "경제",
    },
    {
      gnews: "technology",
      app: "IT",
    },
    {
      gnews: "world",
      app: "국제",
    },
    {
      gnews: "sports",
      app: "스포츠",
    },
    {
      gnews: "entertainment",
      app: "연예",
    },
    {
      gnews: "science",
      app: "과학",
    },
    {
      gnews: "health",
      app: "생활후보",
    },
  ];

  const collected = {};

  for (
    let i = 0;
    i < categoryRequests.length;
    i++
  ) {
    const request = categoryRequests[i];

    console.log(
      `[${request.app}] 뉴스 요청 중...`
    );

    collected[request.app] =
      await fetchFromGNews(
        request.gnews,
        request.app
      );

    if (i < categoryRequests.length - 1) {
      await sleep(REQUEST_DELAY);
    }
  }

  const allArticles =
    Object.values(collected).flat();

  const politicalArticles =
    removeExactDuplicates(
      allArticles.filter((article) =>
        containsKeyword(
          article,
          politicalKeywords
        )
      )
    ).slice(0, 10);

  const societyArticles =
    removeExactDuplicates(
      allArticles.filter((article) =>
        containsKeyword(
          article,
          societyKeywords
        )
      )
    ).slice(0, 10);

  const lifeKeywordArticles =
    removeExactDuplicates(
      allArticles.filter((article) =>
        containsKeyword(
          article,
          lifeKeywords
        )
      )
    );

  const lifeArticles =
    removeExactDuplicates([
      ...lifeKeywordArticles,
      ...(collected["생활후보"] || []),
    ]).slice(0, 10);

  const finalCategories = [
    {
      name: "정치",
      articles: politicalArticles,
    },
    {
      name: "경제",
      articles: (
        collected["경제"] || []
      ).slice(0, 10),
    },
    {
      name: "사회",
      articles: societyArticles,
    },
    {
      name: "IT",
      articles: (
        collected["IT"] || []
      ).slice(0, 10),
    },
    {
      name: "국제",
      articles: (
        collected["국제"] || []
      ).slice(0, 10),
    },
    {
      name: "스포츠",
      articles: (
        collected["스포츠"] || []
      ).slice(0, 10),
    },
    {
      name: "연예",
      articles: (
        collected["연예"] || []
      ).slice(0, 10),
    },
    {
      name: "과학",
      articles: (
        collected["과학"] || []
      ).slice(0, 10),
    },
    {
      name: "생활",
      articles: lifeArticles,
    },
  ];

  const news = [];
  let id = 1;

  for (const category of finalCategories) {
    for (const article of category.articles) {
      news.push(
        makeNewsItem(
          article,
          category.name,
          id
        )
      );

      id += 1;
    }
  }

  console.log("----------------------");

  for (const category of finalCategories) {
    console.log(
      `${category.name}: ${category.articles.length}개`
    );
  }

  console.log(`전체 뉴스: ${news.length}개`);
  console.log("----------------------");

  return news;
}

// 백그라운드에서 뉴스 갱신
async function refreshNews() {
  if (isRefreshing) {
    console.log("이미 뉴스 갱신 중");
    return;
  }

  isRefreshing = true;

  console.log("======================");
  console.log("뉴스 갱신 시작");
  console.log("======================");

  try {
    const news = await getNews();

    // 새 데이터를 정상적으로 받았을 때만
    // 기존 캐시를 교체한다.
    if (news.length > 0) {
      cachedNews = news;

      console.log(
        `뉴스 캐시 갱신 완료: ${news.length}개`
      );
    } else {
      console.log(
        "새 뉴스가 없어 기존 캐시를 유지합니다."
      );
    }
  } catch (error) {
    console.error(
      "뉴스 갱신 실패:",
      error
    );

    console.log(
      "기존 캐시를 유지합니다."
    );
  } finally {
    isRefreshing = false;
  }
}

// 사용자가 접속하면 GNews를 기다리지 않고
// 현재 서버에 저장된 뉴스만 즉시 전달
app.get("/api/news", (req, res) => {
  if (cachedNews.length > 0) {
    return res.json(cachedNews);
  }

  // 서버 시작 직후 아직 최초 갱신이 끝나지 않은 경우
  return res.status(503).json({
    error:
      "뉴스를 준비하고 있습니다. 잠시 후 다시 시도해주세요.",
  });
});

app.use((req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "dist",
      "index.html"
    )
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`뉴스 서버 실행: ${PORT}`);

  // 서버가 켜지면 즉시 첫 뉴스 갱신 시작
  refreshNews();

  // 이후 3시간마다 백그라운드에서 갱신
  setInterval(() => {
    refreshNews();
  }, REFRESH_TIME);
});