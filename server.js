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

const CACHE_TIME = 30 * 60 * 1000;
const REQUEST_DELAY = 1500;
const RETRY_DELAY = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      console.log(`[${name}] 요청 제한 - 5초 후 재시도`);

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

    console.log(`[${name}] ${articles.length}개 가져옴`);

    return articles;
  } catch (error) {
    console.error(`[${name}] 요청 실패:`, error.message);
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
  "교육",
  "학교",
  "노동",
  "복지",
  "사회",
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

function normalizeTitle(title = "") {
  return title
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/["'“”‘’…·]/g, " ")
    .replace(/[^가-힣a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTitleWords(title = "") {
  return new Set(
    normalizeTitle(title)
      .split(" ")
      .filter((word) => word.length >= 2)
  );
}

function titleSimilarity(titleA, titleB) {
  const wordsA = getTitleWords(titleA);
  const wordsB = getTitleWords(titleB);

  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }

  let common = 0;

  for (const word of wordsA) {
    if (wordsB.has(word)) {
      common += 1;
    }
  }

  return common / Math.min(wordsA.size, wordsB.size);
}

function isDuplicateArticle(article, selected) {
  return selected.some((existing) => {
    if (
      article.url &&
      existing.url &&
      article.url === existing.url
    ) {
      return true;
    }

    return (
      titleSimilarity(
        article.title,
        existing.title
      ) >= 0.7
    );
  });
}

// 한 카테고리 안에서만 중복 제거
function removeCategoryDuplicates(articles) {
  const result = [];

  for (const article of articles) {
    if (!article.url) {
      continue;
    }

    if (!isDuplicateArticle(article, result)) {
      result.push(article);
    }
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
      app: "생활",
    },
  ];

  const collected = {};

  for (let i = 0; i < categoryRequests.length; i++) {
    const request = categoryRequests[i];

    console.log(`[${request.app}] 뉴스 요청 중...`);

    collected[request.app] =
      await fetchFromGNews(
        request.gnews,
        request.app
      );

    if (i < categoryRequests.length - 1) {
      await sleep(REQUEST_DELAY);
    }
  }

  // 정치/사회는 전체 후보에서 분류
  const allArticles = Object.values(collected).flat();

  const politicalArticles =
    removeCategoryDuplicates(
      allArticles.filter((article) =>
        containsKeyword(
          article,
          politicalKeywords
        )
      )
    ).slice(0, 10);

  const societyArticles =
    removeCategoryDuplicates(
      allArticles.filter((article) =>
        containsKeyword(
          article,
          societyKeywords
        )
      )
    ).slice(0, 10);

  // 다른 탭과 겹치는 것은 허용.
  // 단, 같은 탭 내부의 중복 기사만 제거.
  const finalCategories = [
    {
      name: "정치",
      articles: politicalArticles,
    },
    {
      name: "경제",
      articles: removeCategoryDuplicates(
        collected["경제"] || []
      ).slice(0, 10),
    },
    {
      name: "사회",
      articles: societyArticles,
    },
    {
      name: "IT",
      articles: removeCategoryDuplicates(
        collected["IT"] || []
      ).slice(0, 10),
    },
    {
      name: "국제",
      articles: removeCategoryDuplicates(
        collected["국제"] || []
      ).slice(0, 10),
    },
    {
      name: "스포츠",
      articles: removeCategoryDuplicates(
        collected["스포츠"] || []
      ).slice(0, 10),
    },
    {
      name: "연예",
      articles: removeCategoryDuplicates(
        collected["연예"] || []
      ).slice(0, 10),
    },
    {
      name: "과학",
      articles: removeCategoryDuplicates(
        collected["과학"] || []
      ).slice(0, 10),
    },
    {
      name: "생활",
      articles: removeCategoryDuplicates(
        collected["생활"] || []
      ).slice(0, 10),
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

app.get("/api/news", async (req, res) => {
  try {
    const now = Date.now();

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

    if (cachedNews) {
      return res.json(cachedNews);
    }

    return res.status(503).json({
      error: "현재 뉴스 데이터를 가져올 수 없습니다.",
    });
  } catch (error) {
    console.error("뉴스 서버 오류:", error);

    if (cachedNews) {
      return res.json(cachedNews);
    }

    return res.status(500).json({
      error: "뉴스를 가져오는 중 오류가 발생했습니다.",
    });
  }
});

app.use((req, res) => {
  res.sendFile(
    path.join(__dirname, "dist", "index.html")
  );
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`뉴스 서버 실행: ${PORT}`);
});