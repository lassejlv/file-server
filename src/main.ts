import { Hono } from "hono";
import UploadRouter from "./routes/upload";
import FilesRouter from "./routes/files";

const app = new Hono();

const DISABLE_UPLOAD_PAGE =
  process.env.FILE_SERVER_DISABLE_UPLOAD_PAGE === "true";

if (!DISABLE_UPLOAD_PAGE) {
  app.get("/", async (c) => {
    const html = await Bun.file("upload.html").text();
    return c.html(html);
  });
}

app.route("/upload", UploadRouter);
app.route("/files", FilesRouter);

app.onError((err, c) => {
  c.status(500);
  return c.json({ error: err.message });
});

export default app;
