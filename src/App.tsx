import { useEffect, useState } from "react";
import "./App.css";

type NewsItem = {
  id: number;
  title: string;
  summary: string;
  category: string;
  source: string;
  url: string;
  image: string | null;
  publishedAt?: string | null;
};

const categories = [
  "🔥 종합",
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

function App() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] =
    useState("🔥 종합");

  useEffect(() => {
    fetch(
      "https://today-news-oc9s.onrender.com/api/news"
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(
            "뉴스를 불러오지 못했습니다."
          );
        }

        return response.json();
      })
      .then((data: NewsItem[]) => {
        setNews(data);
        setLoading(false);
      })
      .catch(() => {
        setError(
          "뉴스를 불러오는 중 문제가 발생했습니다."
        );
        setLoading(false);
      });
  }, []);

  // 종합 탭에서만 중복 기사 제거
  const balancedTopNews = () => {
    const categoryOrder = [
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

    const selected: NewsItem[] = [];

    const normalizeTitle = (title: string) =>
      title
        .toLowerCase()
        .replace(/\[[^\]]*\]/g, " ")
        .replace(/\([^)]*\)/g, " ")
        .replace(/["'“”‘’…·]/g, " ")
        .replace(/[^가-힣a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const getWords = (title: string) =>
      new Set(
        normalizeTitle(title)
          .split(" ")
          .filter((word) => word.length >= 2)
      );

    const isSimilarTitle = (
      titleA: string,
      titleB: string
    ) => {
      const wordsA = getWords(titleA);
      const wordsB = getWords(titleB);

      if (
        wordsA.size === 0 ||
        wordsB.size === 0
      ) {
        return false;
      }

      let common = 0;

      wordsA.forEach((word) => {
        if (wordsB.has(word)) {
          common += 1;
        }
      });

      return (
        common /
          Math.min(
            wordsA.size,
            wordsB.size
          ) >=
        0.7
      );
    };

    const isDuplicate = (
      article: NewsItem
    ) =>
      selected.some(
        (existing) =>
          existing.url === article.url ||
          isSimilarTitle(
            existing.title,
            article.title
          )
      );

    // 각 분야에서 하나씩 우선 선택
    categoryOrder.forEach((category) => {
      const article = news.find(
        (item) =>
          item.category === category &&
          !isDuplicate(item)
      );

      if (
        article &&
        selected.length < 10
      ) {
        selected.push(article);
      }
    });

    // 부족하면 전체 뉴스에서 채우기
    for (const article of news) {
      if (selected.length >= 10) {
        break;
      }

      if (!isDuplicate(article)) {
        selected.push(article);
      }
    }

    return selected.slice(0, 10);
  };

  const filteredNews =
    activeCategory === "🔥 종합"
      ? balancedTopNews()
      : news
          .filter(
            (item) =>
              item.category ===
              activeCategory
          )
          .slice(0, 10);

  const sectionName =
    activeCategory === "🔥 종합"
      ? "종합"
      : activeCategory;

  return (
    <main className="news-app">
      <nav
        className="category-nav"
        aria-label="뉴스 카테고리"
      >
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            className={`category ${
              activeCategory === category
                ? "active"
                : ""
            }`}
            onClick={() =>
              setActiveCategory(category)
            }
          >
            {category}
          </button>
        ))}
      </nav>

      <section className="top-news">
        <div className="section-title">
          <div>
            <h1>
              {sectionName} TOP 10
            </h1>

            <p>지금 확인할 주요 뉴스</p>
          </div>
        </div>

        {loading && (
          <div className="status-box">
            뉴스를 불러오는 중입니다...
          </div>
        )}

        {error && (
          <div className="status-box error">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          filteredNews.length === 0 && (
            <div className="status-box">
              현재 해당 카테고리의 뉴스가
              없습니다.
            </div>
          )}

        {!loading &&
          !error &&
          filteredNews.length > 0 && (
            <div className="news-list">
              {filteredNews.map(
                (item, index) => (
                  <a
                    className="news-card"
                    key={`${item.category}-${item.id}`}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div
                      className={`rank ${
                        index < 3
                          ? "rank-top"
                          : ""
                      }`}
                    >
                      {index + 1}
                    </div>

                    <div className="thumbnail">
                      <img
                        className="news-image"
                        src={
                          item.image ||
                          "/logo.png"
                        }
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          const img =
                            e.currentTarget;

                          if (
                            !img.src.endsWith(
                              "/logo.png"
                            )
                          ) {
                            img.src =
                              "/logo.png";
                          }
                        }}
                      />
                    </div>

                    <div className="news-content">
                      <div className="news-meta">
                        <span className="news-category">
                          {item.category}
                        </span>

                        <span className="dot">
                          ·
                        </span>

                        <span className="source">
                          {item.source}
                        </span>
                      </div>

                      <h2>{item.title}</h2>

                      <p>{item.summary}</p>
                    </div>

                    <div
                      className="arrow"
                      aria-hidden="true"
                    >
                      ›
                    </div>
                  </a>
                )
              )}
            </div>
          )}
      </section>
    </main>
  );
}

export default App;