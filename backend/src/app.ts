import express from "express";

export const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_request, response) => {
  response.status(200).json({
    success: true,
    message: "GNAT Supreme Care API is running",
  });
});
