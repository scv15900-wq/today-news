import { useEffect, useState } from "react";
import "./App.css";

type NewsItem = {
  id: number;
  title: string;
  summary: string;
  category: string;
  time: string;
  source: string;
  url: string;
  image: string | null;
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
  const [activeCategory, setActiveCategory] = useState("🔥 종합");

  useEffect(() => {
    fetch("https://today-news-oc9s.onrender.com/api/news")
      .then((response) => {
        if (!response.ok) {
          throw new Error("뉴스를 불러오지 못했습니다.");
        }

        return response.json();
      })
      .then((data: NewsItem[]) => {
        setNews(data);
        setLoading(false);
      })
      .catch(() => {
        setError("뉴스를 불러오는 중 문제가 발생했습니다.");
        setLoading(false);
      });
  }, []);

  // 종합 TOP10
  // 여러 분야를 골고루 보여주고
  // 같은 카테고리는 최대 2개까지만 표시
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
    const categoryCount: Record<string, number> = {};

    // 1차: 각 카테고리에서 1개씩 선택
    categoryOrder.forEach((category) => {
      const article = news.find(
        (item) =>
          item.category === category &&
          !selected.some(
            (selectedItem) => selectedItem.id === item.id
          )
      );

      if (article && selected.length < 10) {
        selected.push(article);
        categoryCount[category] = 1;
      }
    });

    // 2차: 10개가 부족하면 추가
    // 단, 같은 카테고리는 최대 2개
    // 서버에서 "종합"으로 분류된 기사는 제외
    for (const article of news) {
      if (selected.length >= 10) {
        break;
      }

      if (article.category === "종합") {
        continue;
      }

      const alreadySelected = selected.some(
        (item) => item.id === article.id
      );

      const count = categoryCount[article.category] || 0;

      if (!alreadySelected && count < 2) {
        selected.push(article);
        categoryCount[article.category] = count + 1;
      }
    }

    return selected.slice(0, 10);
  };

  const filteredNews =
    activeCategory === "🔥 종합"
      ? balancedTopNews()
      : news
          .filter((item) => item.category === activeCategory)
          .slice(0, 10);

  return (
    <main className="news-app">
      <header className="news-header">
        <h1>오늘의 뉴스</h1>
        <p className="news-subtitle">
          오늘 가장 주목받는 뉴스 TOP 10
        </p>
      </header>

      <nav
        className="category-nav"
        aria-label="뉴스 카테고리"
      >
        {categories.map((category) => (
          <button
            key={category}
            className={`category ${
              activeCategory === category ? "active" : ""
            }`}
            onClick={() => setActiveCategory(category)}
          >
            {category}
          </button>
        ))}
      </nav>

      <section className="top-news">
        <div className="section-title">
          <h2>
            {activeCategory === "🔥 종합"
              ? "🔥 종합 뉴스"
              : `${activeCategory} 뉴스`}
          </h2>
        </div>

        {loading && (
          <p>뉴스를 불러오는 중입니다...</p>
        )}

        {error && <p>{error}</p>}

        {!loading &&
          !error &&
          filteredNews.length === 0 && (
            <p>
              현재 해당 카테고리의 뉴스가 없습니다.
            </p>
          )}

        {!loading &&
          !error &&
          filteredNews.length > 0 && (
            <div className="news-list">
              {filteredNews.map((item, index) => (
                <a
                  className="news-card"
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="rank">
                    {index + 1}
                  </div>

                  {item.image && (
                    <img
                      className="news-image"
                      src={item.image}
                      alt=""
                      loading="lazy"
                    />
                  )}

                  <div className="news-content">
                    <div className="news-meta">
                      <span>{item.category}</span>
                      <span>·</span>
                      <span>{item.source}</span>
                    </div>

                    <h3>{item.title}</h3>

                    <p>{item.summary}</p>
                  </div>

                  <div className="arrow">›</div>
                </a>
              ))}
            </div>
          )}
      </section>
    </main>
  );
}

export default App;