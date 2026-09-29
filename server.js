import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

function formatTime(publishedAt) {
  const published = new Date(publishedAt);
  const now = new Date();
  const diffMinutes = Math.floor((now - published) / 60000);

  if (diffMinutes < 60) {
    return `${Math.max(diffMinutes, 1)}분 전`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}시간 전`;
  }

  return `${Math.floor(diffHours / 24)}일 전`;
}

app.get("/api/news", async (req, res) => {
  try {
    const apiKey = process.env.GNEWS_API_KEY;

    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "GNEWS_API_KEY가 설정되지 않았습니다." });
    }

    const url =
      `https://gnews.io/api/v4/top-headlines` +
      `?country=kr&lang=ko&max=10&apikey=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(response.status).json({
        error: "GNews API 요청 실패",
        detail: errorText,
      });
    }

    const data = await response.json();
    const articles = Array.isArray(data.articles) ? data.articles : [];

    const news = articles.slice(0, 10).map((article, index) => ({
      id: index + 1,
      title: article.title,
      summary: article.description || "요약 정보가 없습니다.",
      category: "종합",
      time: formatTime(article.publishedAt),
      source: article.source?.name || "뉴스 출처",
      url: article.url,
    }));

    res.json(news);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "뉴스를 가져오는 중 오류가 발생했습니다.",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`뉴스 서버 실행: ${PORT}`);
});
