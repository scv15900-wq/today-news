import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const GNEWS_API_KEY = process.env.GNEWS_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

/* =========================
   기본 설정
========================= */

const REFRESH_TIME = 3 * 60 * 60 * 1000;
const REQUEST_DELAY = 1500;
const RETRY_DELAY = 5000;

let cachedNews = [];
let lastSuccessfulRefresh = null;
let isRefreshing = false;
let refreshTimer = null;

/* =========================
   Supabase 연결
========================= */

let supabase = null;

if (SUPABASE_URL && SUPABASE_SECRET_KEY) {
  supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SECRET_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  console.log("Supabase 연결 준비 완료");
} else {
  console.warn("Supabase 환경변수가 없습니다.");
}

/* =========================
   GNews 카테고리
========================= */

const gnewsCategories = [
  {
    category: "종합후보",
    gnewsCategory: "general",
  },
  {
    category: "경제",
    gnewsCategory: "business",
  },
  {
    category: "IT",
    gnewsCategory: "technology",
  },
  {
    category: "국제",
    gnewsCategory: "world",
  },
  {
    category: "스포츠",
    gnewsCategory: "sports",
  },
  {
    category: "연예",
    gnewsCategory: "entertainment",
  },
  {
    category: "과학",
    gnewsCategory: "science",
  },
  {
    category: "생활후보",
    gnewsCategory: "health",
  },
];

/* =========================
   정치 키워드
========================= */

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

/* =========================
   사회 키워드
========================= */

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

/* =========================
   생활 키워드
========================= */

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

/* =========================
   유틸
========================= */

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function containsKeyword(article, keywords) {
  const text = `
    ${article.title || ""}
    ${article.summary || ""}
  `.toLowerCase();

  return keywords.some((keyword) =>
    text.includes(keyword.toLowerCase())
  );
}

function removeExactDuplicates(articles) {
  const seen = new Set();

  return articles.filter((article) => {
    const key =
      article.url ||
      `${article.title || ""}-${article.source || ""}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

/* =========================
   기존 카테고리 뉴스
========================= */

function getOldCategoryNews(category) {
  return cachedNews
    .filter((article) => article.category === category)
    .slice(0, 10);
}

/* =========================
   새 뉴스 + 기존 뉴스
========================= */

function mergeWithOldNews(category, newArticles) {
  const oldArticles = getOldCategoryNews(category);

  const combined = [
    ...(Array.isArray(newArticles) ? newArticles : []),
    ...oldArticles,
  ];

  const seen = new Set();
  const result = [];

  for (const article of combined) {
    if (result.length >= 10) {
      break;
    }

    const key =
      article.url ||
      `${article.title || ""}-${article.source || ""}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);

    result.push({
      title: article.title || "제목 없음",
      summary: article.summary || "",
      source: article.source || "출처 없음",
      url: article.url || "#",
      image: article.image || null,
      publishedAt: article.publishedAt || null,
    });
  }

  return result;
}

/* =========================
   GNews 호출

   quotaExceeded:
   일일 요청 한도가 끝났는지 표시
========================= */

async function fetchFromGNews(gnewsCategory) {
  if (!GNEWS_API_KEY) {
    console.error("GNEWS_API_KEY가 없습니다.");

    return {
      success: false,
      articles: [],
      quotaExceeded: false,
    };
  }

  const url =
    "https://gnews.io/api/v4/top-headlines" +
    `?category=${encodeURIComponent(gnewsCategory)}` +
    "&lang=ko" +
    "&country=kr" +
    "&max=10" +
    `&apikey=${encodeURIComponent(GNEWS_API_KEY)}`;

  try {
    let response = await fetch(url);

    /*
      429일 때만 1회 재시도
    */

    if (response.status === 429) {
      console.log(`GNews 429 발생: ${gnewsCategory}`);

      await sleep(RETRY_DELAY);

      response = await fetch(url);
    }

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        `GNews 오류 ${response.status}: ${gnewsCategory}`,
        errorText
      );

      /*
        GNews 일일 요청 한도 초과 감지

        현재 실제 로그:
        "You have reached your request limit for today"
      */

      const lowerError = errorText.toLowerCase();

      const quotaExceeded =
        response.status === 403 &&
        (
          lowerError.includes("request limit") ||
          lowerError.includes("reached your request limit")
        );

      if (quotaExceeded) {
        console.log(
          "GNews 일일 요청 한도 초과를 감지했습니다."
        );
      }

      return {
        success: false,
        articles: [],
        quotaExceeded,
      };
    }

    const data = await response.json();

    if (!Array.isArray(data.articles)) {
      console.error(
        `GNews 응답 형식 오류: ${gnewsCategory}`
      );

      return {
        success: false,
        articles: [],
        quotaExceeded: false,
      };
    }

    const articles = data.articles.map((article) => ({
      title: article.title || "제목 없음",
      summary: article.description || "",
      source: article.source?.name || "출처 없음",
      url: article.url || "#",
      image: article.image || null,
      publishedAt: article.publishedAt || null,
    }));

    return {
      success: true,
      articles,
      quotaExceeded: false,
    };
  } catch (error) {
    console.error(
      `GNews 요청 실패: ${gnewsCategory}`,
      error
    );

    return {
      success: false,
      articles: [],
      quotaExceeded: false,
    };
  }
}

/* =========================
   Supabase 저장
========================= */

async function saveNewsToSupabase(news) {
  if (!supabase) {
    return false;
  }

  if (!Array.isArray(news) || news.length === 0) {
    return false;
  }

  const updatedAt = new Date().toISOString();

  try {
    const { error } = await supabase
      .from("news_cache")
      .upsert(
        {
          cache_key: "latest_news",
          news_data: news,
          updated_at: updatedAt,
        },
        {
          onConflict: "cache_key",
        }
      );

    if (error) {
      console.error(
        "Supabase 뉴스 저장 실패:",
        error.message
      );

      return false;
    }

    lastSuccessfulRefresh = updatedAt;

    console.log(
      `Supabase 뉴스 저장 완료 (${news.length}개)`
    );

    console.log(
      `마지막 정상 저장: ${updatedAt}`
    );

    return true;
  } catch (error) {
    console.error(
      "Supabase 저장 중 오류:",
      error
    );

    return false;
  }
}

/* =========================
   Supabase 복구
========================= */

async function loadNewsFromSupabase() {
  if (!supabase) {
    return {
      news: [],
      updatedAt: null,
    };
  }

  try {
    const { data, error } = await supabase
      .from("news_cache")
      .select("news_data, updated_at")
      .eq("cache_key", "latest_news")
      .maybeSingle();

    if (error) {
      console.error(
        "Supabase 뉴스 불러오기 실패:",
        error.message
      );

      return {
        news: [],
        updatedAt: null,
      };
    }

    if (
      !data ||
      !Array.isArray(data.news_data) ||
      data.news_data.length === 0
    ) {
      console.log(
        "Supabase에 저장된 뉴스가 없습니다."
      );

      return {
        news: [],
        updatedAt: null,
      };
    }

    console.log(
      `Supabase 뉴스 복구 완료 (${data.news_data.length}개)`
    );

    console.log(
      `마지막 저장 시간: ${data.updated_at}`
    );

    return {
      news: data.news_data,
      updatedAt: data.updated_at || null,
    };
  } catch (error) {
    console.error(
      "Supabase 복구 중 오류:",
      error
    );

    return {
      news: [],
      updatedAt: null,
    };
  }
}

/* =========================
   캐시 시간 확인
========================= */

function isCacheFresh() {
  if (!lastSuccessfulRefresh) {
    return false;
  }

  const savedTime =
    new Date(lastSuccessfulRefresh).getTime();

  if (!Number.isFinite(savedTime)) {
    return false;
  }

  const age = Date.now() - savedTime;

  return age >= 0 && age < REFRESH_TIME;
}

function getNextRefreshDelay() {
  if (!lastSuccessfulRefresh) {
    return 0;
  }

  const savedTime =
    new Date(lastSuccessfulRefresh).getTime();

  if (!Number.isFinite(savedTime)) {
    return 0;
  }

  return Math.max(
    0,
    savedTime + REFRESH_TIME - Date.now()
  );
}

/* =========================
   최종 뉴스 배열
========================= */

function buildFinalNews(categoryMap) {
  const finalNews = [];
  let id = 1;

  const categoryOrder = [
    "종합",
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

  for (const category of categoryOrder) {
    const articles = categoryMap[category] || [];

    articles.slice(0, 10).forEach((article) => {
      finalNews.push({
        id,
        title: article.title,
        summary: article.summary || "",
        category,
        source: article.source || "출처 없음",
        url: article.url || "#",
        image: article.image || null,
        publishedAt: article.publishedAt || null,
      });

      id += 1;
    });
  }

  return finalNews;
}

/* =========================
   전체 뉴스 갱신
========================= */

async function refreshNews() {
  if (isRefreshing) {
    console.log("이미 뉴스 갱신 중입니다.");
    return false;
  }

  isRefreshing = true;

  console.log("뉴스 갱신 시작...");

  try {
    const collected = {};

    let successCount = 0;
    let quotaExceeded = false;

    /*
      GNews 카테고리 순차 요청

      일반적인 오류:
      → 다음 카테고리 계속 시도

      일일 요청 한도 초과:
      → 즉시 전체 요청 중단
    */

    for (
      let i = 0;
      i < gnewsCategories.length;
      i += 1
    ) {
      const item = gnewsCategories[i];

      console.log(
        `GNews 요청: ${item.gnewsCategory}`
      );

      const result = await fetchFromGNews(
        item.gnewsCategory
      );

      collected[item.category] = {
        success: result.success,
        articles: result.articles,
      };

      if (result.success) {
        successCount += 1;
      }

      /*
        요청 한도가 끝났다면
        나머지 카테고리 요청 즉시 중단
      */

      if (result.quotaExceeded) {
        quotaExceeded = true;

        console.log(
          "GNews 요청 한도가 소진되어 나머지 요청을 중단합니다."
        );

        break;
      }

      if (i < gnewsCategories.length - 1) {
        await sleep(REQUEST_DELAY);
      }
    }

    /*
      한 건도 성공하지 못했다면
      기존 데이터 유지
    */

    if (successCount === 0) {
      if (quotaExceeded) {
        console.log(
          "GNews 요청 한도가 소진되었습니다."
        );
      } else {
        console.log(
          "모든 GNews 요청이 실패했습니다."
        );
      }

      console.log(
        "기존 저장 뉴스를 그대로 유지합니다."
      );

      return false;
    }

    console.log(
      `GNews 성공: ${successCount}/${gnewsCategories.length}`
    );

    /*
      성공한 요청의 기사만 모음
    */

    const successfulArticles = [];

    for (const item of gnewsCategories) {
      const result = collected[item.category];

      if (
        result?.success &&
        Array.isArray(result.articles)
      ) {
        successfulArticles.push(
          ...result.articles
        );
      }
    }

    /* =====================
       정치 새 뉴스
    ===================== */

    const newPolitical =
      removeExactDuplicates(
        successfulArticles.filter((article) =>
          containsKeyword(
            article,
            politicalKeywords
          )
        )
      ).slice(0, 10);

    /* =====================
       사회 새 뉴스
    ===================== */

    const newSociety =
      removeExactDuplicates(
        successfulArticles.filter((article) =>
          containsKeyword(
            article,
            societyKeywords
          )
        )
      ).slice(0, 10);

    /* =====================
       생활 새 뉴스
    ===================== */

    const newLifeKeywords =
      removeExactDuplicates(
        successfulArticles.filter((article) =>
          containsKeyword(
            article,
            lifeKeywords
          )
        )
      );

    const healthResult = collected["생활후보"];

    const newLife =
      removeExactDuplicates([
        ...newLifeKeywords,
        ...(healthResult?.success
          ? healthResult.articles
          : []),
      ]).slice(0, 10);

    /* =====================
       직접 카테고리
    ===================== */

    const generalResult = collected["종합후보"];
    const economyResult = collected["경제"];
    const itResult = collected["IT"];
    const worldResult = collected["국제"];
    const sportsResult = collected["스포츠"];
    const entertainmentResult = collected["연예"];
    const scienceResult = collected["과학"];

    const newGeneral =
      generalResult?.success
        ? generalResult.articles
        : [];

    const newEconomy =
      economyResult?.success
        ? economyResult.articles
        : [];

    const newIT =
      itResult?.success
        ? itResult.articles
        : [];

    const newWorld =
      worldResult?.success
        ? worldResult.articles
        : [];

    const newSports =
      sportsResult?.success
        ? sportsResult.articles
        : [];

    const newEntertainment =
      entertainmentResult?.success
        ? entertainmentResult.articles
        : [];

    const newScience =
      scienceResult?.success
        ? scienceResult.articles
        : [];

    /* =====================
       새 뉴스 + 이전 뉴스
    ===================== */

    const categoryMap = {
      종합: mergeWithOldNews(
        "종합",
        newGeneral
      ),

      정치: mergeWithOldNews(
        "정치",
        newPolitical
      ),

      경제: mergeWithOldNews(
        "경제",
        newEconomy
      ),

      사회: mergeWithOldNews(
        "사회",
        newSociety
      ),

      IT: mergeWithOldNews(
        "IT",
        newIT
      ),

      국제: mergeWithOldNews(
        "국제",
        newWorld
      ),

      스포츠: mergeWithOldNews(
        "스포츠",
        newSports
      ),

      연예: mergeWithOldNews(
        "연예",
        newEntertainment
      ),

      과학: mergeWithOldNews(
        "과학",
        newScience
      ),

      생활: mergeWithOldNews(
        "생활",
        newLife
      ),
    };

    for (
      const [category, articles] of
      Object.entries(categoryMap)
    ) {
      console.log(
        `${category}: ${articles.length}개`
      );
    }

    const finalNews =
      buildFinalNews(categoryMap);

    if (finalNews.length === 0) {
      console.log(
        "최종 뉴스가 비어 있습니다."
      );

      console.log(
        "기존 캐시를 유지합니다."
      );

      return false;
    }

    /*
      Supabase가 있으면
      영구 저장 성공 후 메모리 교체
    */

    if (supabase) {
      const saved =
        await saveNewsToSupabase(finalNews);

      if (!saved) {
        console.log(
          "Supabase 저장에 실패했습니다."
        );

        console.log(
          "기존 캐시를 유지합니다."
        );

        return false;
      }
    } else {
      lastSuccessfulRefresh =
        new Date().toISOString();
    }

    cachedNews = finalNews;

    console.log(
      `뉴스 갱신 완료 (${cachedNews.length}개)`
    );

    /*
      일부 카테고리 수집 후
      한도가 끝난 경우에도

      이미 받은 새 뉴스 +
      기존 뉴스 조합은 정상 저장됨
    */

    if (quotaExceeded) {
      console.log(
        "이번 갱신 도중 GNews 요청 한도가 소진되었습니다."
      );
    }

    return true;
  } catch (error) {
    console.error(
      "뉴스 갱신 중 오류:",
      error
    );

    console.log(
      "기존 캐시를 유지합니다."
    );

    return false;
  } finally {
    isRefreshing = false;
  }
}

/* =========================
   다음 갱신 예약
========================= */

function scheduleNextRefresh(delay) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }

  const safeDelay = Math.max(
    1000,
    delay
  );

  const minutes = Math.ceil(
    safeDelay / 1000 / 60
  );

  console.log(
    `다음 뉴스 갱신까지 약 ${minutes}분`
  );

  refreshTimer = setTimeout(
    async () => {
      await refreshNews();

      scheduleNextRefresh(
        REFRESH_TIME
      );
    },
    safeDelay
  );
}

/* =========================
   뉴스 API
========================= */

app.get("/api/news", (req, res) => {
  if (
    Array.isArray(cachedNews) &&
    cachedNews.length > 0
  ) {
    return res.json(cachedNews);
  }

  return res.status(503).json({
    error:
      "뉴스를 준비하고 있습니다. 잠시 후 다시 시도해주세요.",
  });
});

/* =========================
   서버 상태
========================= */

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    cachedNews: cachedNews.length,
    refreshing: isRefreshing,
    supabase: Boolean(supabase),
    lastSuccessfulRefresh,
    cacheFresh: isCacheFresh(),
  });
});

/* =========================
   서버 시작

   Supabase 뉴스부터 복구한 뒤
   외부 요청을 받기 시작
========================= */

async function startServer() {
  console.log("저장된 뉴스 확인 중...");

  const saved =
    await loadNewsFromSupabase();

  if (saved.news.length > 0) {
    cachedNews = saved.news;
    lastSuccessfulRefresh =
      saved.updatedAt;

    console.log(
      `저장된 뉴스 복구 완료 (${cachedNews.length}개)`
    );
  } else {
    console.log(
      "복구할 저장 뉴스가 없습니다."
    );
  }

  app.listen(PORT, () => {
    console.log(
      `서버 실행 중: ${PORT}`
    );

    /*
      저장 뉴스가 아직 3시간 이내
      → GNews 호출 생략
    */

    if (
      cachedNews.length > 0 &&
      isCacheFresh()
    ) {
      const remaining =
        getNextRefreshDelay();

      console.log(
        "저장된 뉴스가 아직 최신입니다."
      );

      console.log(
        "GNews 호출을 생략합니다."
      );

      scheduleNextRefresh(
        remaining
      );

      return;
    }

    /*
      저장 뉴스가 있지만 오래됨
      → 기존 뉴스 즉시 제공
      → 백그라운드 새 뉴스 갱신
    */

    if (cachedNews.length > 0) {
      console.log(
        "기존 뉴스를 먼저 제공합니다."
      );

      console.log(
        "새 뉴스는 백그라운드에서 갱신합니다."
      );

      refreshNews().finally(() => {
        scheduleNextRefresh(
          REFRESH_TIME
        );
      });

      return;
    }

    /*
      완전 최초 상태
    */

    console.log(
      "저장된 뉴스가 없어 새 뉴스를 가져옵니다."
    );

    refreshNews().finally(() => {
      scheduleNextRefresh(
        REFRESH_TIME
      );
    });
  });
}

/* =========================
   서버 실행
========================= */

startServer().catch((error) => {
  console.error(
    "서버 시작 실패:",
    error
  );

  process.exit(1);
});