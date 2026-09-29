import express from "express";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());

const news = [
  {
    id: 1,
    title: "실제 뉴스 연결 테스트입니다",
    summary: "앱에서 내 서버의 뉴스를 정상적으로 받아오는지 확인합니다.",
    category: "종합",
    time: "방금 전",
    source: "오늘의 뉴스",
    url: "https://www.google.com",
  },
  {
    id: 2,
    title: "경제 뉴스 연결 테스트",
    summary: "경제 분야 뉴스 데이터입니다.",
    category: "경제",
    time: "10분 전",
    source: "오늘의 뉴스",
    url: "https://www.google.com",
  },
  {
    id: 3,
    title: "사회 뉴스 연결 테스트",
    summary: "사회 분야 뉴스 데이터입니다.",
    category: "사회",
    time: "20분 전",
    source: "오늘의 뉴스",
    url: "https://www.google.com",
  },
  {
    id: 4,
    title: "IT 뉴스 연결 테스트",
    summary: "IT 분야 뉴스 데이터입니다.",
    category: "IT",
    time: "30분 전",
    source: "오늘의 뉴스",
    url: "https://www.google.com",
  },
];

app.get("/api/news", (req, res) => {
  res.json(news);
});

app.listen(PORT, () => {
  console.log(`뉴스 서버 실행: http://localhost:${PORT}`);
});
