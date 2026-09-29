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
};

function App() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("http://localhost:3000/api/news")
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

  return (
    <main className="news-app">
      <header className="news-header">
        <p className="news-date">2026년 9월 29일</p>

        <h1>오늘의 뉴스</h1>

        <p className="news-subtitle">
          오늘 가장 주목받는 뉴스 TOP 10
        </p>
      </header>

      <nav className="category-nav" aria-label="뉴스 카테고리">
        <button className="category active">🔥 종합</button>
        <button className="category">경제</button>
        <button className="category">사회</button>
        <button className="category">IT</button>
        <button className="category">국제</button>
      </nav>

      <section className="top-news">
        <div className="section-title">
          <span>🔥</span>
          <h2>오늘의 TOP 10</h2>
        </div>

        {loading && (
          <p>뉴스를 불러오는 중입니다...</p>
        )}

        {error && (
          <p>{error}</p>
        )}

        {!loading && !error && (
          <div className="news-list">
            {news.map((item, index) => (
              <a
                className="news-card"
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="rank">{index + 1}</div>

                <div className="news-content">
                  <div className="news-meta">
                    <span>{item.category}</span>
                    <span>·</span>
                    <span>{item.time}</span>
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