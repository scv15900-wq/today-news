import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const GNEWS_API_KEY =
  process.env.GNEWS_API_KEY;

const SUPABASE_URL =
  process.env.SUPABASE_URL;

const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY;

/* =========================
   Supabase 연결
========================= */

let supabase = null;

if (
  SUPABASE_URL &&
  SUPABASE_SECRET_KEY
) {
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
  console.warn(
    "Supabase 환경변수가 없습니다."
  );
}

/* =========================
   뉴스 캐시
========================= */

let cachedNews = [];

let isRefreshing = false;

/*
  3시간마다 뉴스 갱신
*/
const REFRESH_TIME =
  3 * 60 * 60 * 1000;

/*
  GNews 요청 사이 간격
*/
const REQUEST_DELAY = 1500;

/*
  429 발생 시 재시도 대기
*/
const RETRY_DELAY = 5000;

/* =========================
   카테고리 설정
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
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

function containsKeyword(
  article,
  keywords
) {
  const text = `
    ${article.title || ""}
    ${article.summary || ""}
  `.toLowerCase();

  return keywords.some((keyword) =>
    text.includes(
      keyword.toLowerCase()
    )
  );
}

/*
  완전히 같은 URL 기사 제거
*/
function removeExactDuplicates(
  articles
) {
  const seen = new Set();

  return articles.filter((article) => {
    if (!article.url) {
      return true;
    }

    if (seen.has(article.url)) {
      return false;
    }

    seen.add(article.url);

    return true;
  });
}

/* =========================
   GNews 호출
========================= */

async function fetchFromGNews(
  gnewsCategory
) {
  const url =
    "https://gnews.io/api/v4/top-headlines" +
    `?category=${encodeURIComponent(
      gnewsCategory
    )}` +
    "&lang=ko" +
    "&country=kr" +
    "&max=10" +
    `&apikey=${encodeURIComponent(
      GNEWS_API_KEY
    )}`;

  try {
    let response = await fetch(url);

    /*
      429일 경우 한 번 기다렸다 재시도
    */
    if (response.status === 429) {
      console.log(
        `GNews 429 발생: ${gnewsCategory}`
      );

      await sleep(RETRY_DELAY);

      response = await fetch(url);
    }

    if (!response.ok) {
      const errorText =
        await response.text();

      console.error(
        `GNews 오류 ${response.status}`,
        errorText
      );

      return [];
    }

    const data =
      await response.json();

    if (
      !Array.isArray(data.articles)
    ) {
      return [];
    }

    return data.articles.map(
      (article) => ({
        title:
          article.title ||
          "제목 없음",

        summary:
          article.description ||
          "",

        source:
          article.source?.name ||
          "출처 없음",

        url:
          article.url ||
          "#",

        image:
          article.image ||
          null,

        publishedAt:
          article.publishedAt ||
          null,
      })
    );
  } catch (error) {
    console.error(
      `GNews 요청 실패: ${gnewsCategory}`,
      error
    );

    return [];
  }
}

/* =========================
   Supabase 저장
========================= */

async function saveNewsToSupabase(
  news
) {
  if (!supabase) {
    return false;
  }

  if (
    !Array.isArray(news) ||
    news.length === 0
  ) {
    return false;
  }

  try {
    const { error } =
      await supabase
        .from("news_cache")
        .upsert(
          {
            cache_key:
              "latest_news",

            news_data:
              news,

            updated_at:
              new Date().toISOString(),
          },
          {
            onConflict:
              "cache_key",
          }
        );

    if (error) {
      console.error(
        "Supabase 뉴스 저장 실패:",
        error.message
      );

      return false;
    }

    console.log(
      `Supabase 뉴스 저장 완료 (${news.length}개)`
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
    return [];
  }

  try {
    const {
      data,
      error,
    } =
      await supabase
        .from("news_cache")
        .select(
          "news_data, updated_at"
        )
        .eq(
          "cache_key",
          "latest_news"
        )
        .maybeSingle();

    if (error) {
      console.error(
        "Supabase 뉴스 불러오기 실패:",
        error.message
      );

      return [];
    }

    if (
      !data ||
      !Array.isArray(
        data.news_data
      ) ||
      data.news_data.length === 0
    ) {
      console.log(
        "Supabase에 저장된 뉴스가 없습니다."
      );

      return [];
    }

    console.log(
      `Supabase 뉴스 복구 완료 (${data.news_data.length}개)`
    );

    console.log(
      `마지막 저장 시간: ${data.updated_at}`
    );

    return data.news_data;
  } catch (error) {
    console.error(
      "Supabase 복구 중 오류:",
      error
    );

    return [];
  }
}

/* =========================
   전체 뉴스 갱신
========================= */

async function refreshNews() {
  if (isRefreshing) {
    console.log(
      "이미 뉴스 갱신 중입니다."
    );

    return;
  }

  isRefreshing = true;

  console.log(
    "뉴스 갱신 시작..."
  );

  try {
    const collected = {};

    /*
      GNews 무료 요청 제한을 고려해
      순차적으로 호출
    */
    for (
      let i = 0;
      i < gnewsCategories.length;
      i += 1
    ) {
      const item =
        gnewsCategories[i];

      console.log(
        `GNews 요청: ${item.gnewsCategory}`
      );

      const articles =
        await fetchFromGNews(
          item.gnewsCategory
        );

      collected[
        item.category
      ] = articles;

      /*
        마지막 요청 이후에는
        기다릴 필요 없음
      */
      if (
        i <
        gnewsCategories.length - 1
      ) {
        await sleep(
          REQUEST_DELAY
        );
      }
    }

    /*
      가져온 모든 후보 기사
    */
    const allArticles = [
      ...(collected[
        "종합후보"
      ] || []),

      ...(collected[
        "경제"
      ] || []),

      ...(collected[
        "IT"
      ] || []),

      ...(collected[
        "국제"
      ] || []),

      ...(collected[
        "스포츠"
      ] || []),

      ...(collected[
        "연예"
      ] || []),

      ...(collected[
        "과학"
      ] || []),

      ...(collected[
        "생활후보"
      ] || []),
    ];

    /*
      아무 뉴스도 못 가져온 경우
      기존 캐시는 절대 지우지 않음
    */
    if (allArticles.length === 0) {
      console.log(
        "새 뉴스를 가져오지 못했습니다."
      );

      console.log(
        "기존 저장 뉴스를 유지합니다."
      );

      return;
    }

    /* =====================
       정치
    ===================== */

    const politicalArticles =
      removeExactDuplicates(
        allArticles.filter(
          (article) =>
            containsKeyword(
              article,
              politicalKeywords
            )
        )
      ).slice(0, 10);

    /* =====================
       사회
    ===================== */

    const societyArticles =
      removeExactDuplicates(
        allArticles.filter(
          (article) =>
            containsKeyword(
              article,
              societyKeywords
            )
        )
      ).slice(0, 10);

    /* =====================
       생활
    ===================== */

    const lifeKeywordArticles =
      removeExactDuplicates(
        allArticles.filter(
          (article) =>
            containsKeyword(
              article,
              lifeKeywords
            )
        )
      );

    const lifeArticles =
      removeExactDuplicates([
        ...lifeKeywordArticles,
        ...(collected[
          "생활후보"
        ] || []),
      ]).slice(0, 10);

    /* =====================
       최종 뉴스 생성
    ===================== */

    const finalNews = [];

    let id = 1;

    const addCategory = (
      category,
      articles
    ) => {
      articles
        .slice(0, 10)
        .forEach(
          (article) => {
            finalNews.push({
              id,
              title:
                article.title,
              summary:
                article.summary,
              category,
              source:
                article.source,
              url:
                article.url,
              image:
                article.image,
              publishedAt:
                article.publishedAt,
            });

            id += 1;
          }
        );
    };

    /*
      종합후보도 저장
      프론트 종합 탭에서
      중복 제거 및 균형 선택
    */
    addCategory(
      "종합",
      collected[
        "종합후보"
      ] || []
    );

    addCategory(
      "정치",
      politicalArticles
    );

    addCategory(
      "경제",
      collected["경제"] || []
    );

    addCategory(
      "사회",
      societyArticles
    );

    addCategory(
      "IT",
      collected["IT"] || []
    );

    addCategory(
      "국제",
      collected["국제"] || []
    );

    addCategory(
      "스포츠",
      collected["스포츠"] || []
    );

    addCategory(
      "연예",
      collected["연예"] || []
    );

    addCategory(
      "과학",
      collected["과학"] || []
    );

    addCategory(
      "생활",
      lifeArticles
    );

    if (
      finalNews.length === 0
    ) {
      console.log(
        "최종 뉴스가 비어 있습니다."
      );

      console.log(
        "기존 캐시를 유지합니다."
      );

      return;
    }

    /*
      1. 메모리 캐시 교체
    */
    cachedNews = finalNews;

    console.log(
      `뉴스 갱신 완료 (${cachedNews.length}개)`
    );

    /*
      2. Supabase 영구 저장
    */
    await saveNewsToSupabase(
      cachedNews
    );
  } catch (error) {
    console.error(
      "뉴스 갱신 중 오류:",
      error
    );

    console.log(
      "기존 캐시를 유지합니다."
    );
  } finally {
    isRefreshing = false;
  }
}

/* =========================
   API
========================= */

app.get(
  "/api/news",
  (req, res) => {
    /*
      메모리에 뉴스가 있으면
      즉시 반환
    */
    if (
      Array.isArray(
        cachedNews
      ) &&
      cachedNews.length > 0
    ) {
      return res.json(
        cachedNews
      );
    }

    /*
      서버 최초 실행이고
      Supabase에도 데이터가 없는 경우
    */
    return res.status(503).json({
      error:
        "뉴스를 준비하고 있습니다. 잠시 후 다시 시도해주세요.",
    });
  }
);

/* =========================
   서버 상태 확인
========================= */

app.get(
  "/",
  (req, res) => {
    res.json({
      status: "ok",

      cachedNews:
        cachedNews.length,

      refreshing:
        isRefreshing,

      supabase:
        Boolean(supabase),
    });
  }
);

/* =========================
   서버 시작
========================= */

app.listen(
  PORT,
  async () => {
    console.log(
      `서버 실행 중: ${PORT}`
    );

    /*
      1.
      서버 재시작 시
      Supabase에서 마지막 뉴스 복구
    */
    const savedNews =
      await loadNewsFromSupabase();

    if (
      savedNews.length > 0
    ) {
      cachedNews =
        savedNews;

      console.log(
        "저장된 뉴스로 서버 시작 완료"
      );
    }

    /*
      2.
      GNews 최신 뉴스는
      백그라운드에서 갱신
    */
    refreshNews();

    /*
      3.
      이후 3시간마다 갱신
    */
    setInterval(
      refreshNews,
      REFRESH_TIME
    );
  }
);