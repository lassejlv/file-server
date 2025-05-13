import { Hono } from "hono";
import UploadRouter from "./routes/upload";
import FilesRouter from "./routes/files";
import consola from "consola";
import { bearerAuth } from "hono/bearer-auth";

const app = new Hono();

const DISABLE_UPLOAD_PAGE =
  process.env.FILE_SERVER_DISABLE_UPLOAD_PAGE === "true";

const REQUIRE_AUTH = process.env.FILE_SERVER_AUTH_TOKEN;

if (REQUIRE_AUTH) {
  consola.success("Auth at /upload is enabled. This is recommended for prod.");
  app.use("/upload", bearerAuth({ token: REQUIRE_AUTH }));
} else {
  consola.warn(
    "Auth at /upload is disabled. This is not recommended for prod.",
  );
}

if (!DISABLE_UPLOAD_PAGE) {
  consola.warn(
    "Running with upload page enabled, in prod you may wanna disable this. Set the env variable FILE_SERVER_DISABLE_UPLOAD_PAGE=true",
  );
  app.get("/", async (c) => {
    const html = await Bun.file("upload.html").text();
    return c.html(html);
  });

  app.get("/style.build.css", async (c) => {
    const css = await Bun.file("style.build.css").text();
    return c.html(css);
  });
}

app.route("/upload", UploadRouter);
app.route("/files", FilesRouter);

app.onError((err, c) => {
  c.status(500);
  return c.json({ error: err.message });
});

export default app;
