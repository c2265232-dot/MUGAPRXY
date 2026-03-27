const express = require("express");
const fetch = require("node-fetch");
const cheerio = require("cheerio");
const cookieParser = require("cookie-parser");

const app = express();
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const PORT = 3000;

/* -------------------------
   SECURITY: ALLOW LIST
------------------------- */
const ALLOWED = [
  "example.com",
  "wikipedia.org",
  "developer.mozilla.org"
];

/* -------------------------
   HELPER: VALIDATE URL
------------------------- */
function isAllowed(url) {
  try {
    const u = new URL(url);
    return ALLOWED.some(domain => u.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

/* -------------------------
   REWRITE URL
------------------------- */
function rewriteUrl(base, link) {
  try {
    return "/proxy?url=" + encodeURIComponent(new URL(link, base).href);
  } catch {
    return link;
  }
}

/* -------------------------
   HTML REWRITER
------------------------- */
function rewriteHTML(html, baseUrl) {
  const $ = cheerio.load(html);

  $("a, link, script, img, form").each((i, el) => {
    const attr = el.name === "form" ? "action" : "href";

    if ($(el).attr(attr)) {
      $(el).attr(attr, rewriteUrl(baseUrl, $(el).attr(attr)));
    }

    if ($(el).attr("src")) {
      $(el).attr("src", rewriteUrl(baseUrl, $(el).attr("src")));
    }
  });

  return $.html();
}

/* -------------------------
   HOMEPAGE
------------------------- */
app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

/* -------------------------
   MAIN PROXY
------------------------- */
app.all("/proxy", async (req, res) => {
  const target = req.query.url;

  if (!target) return res.send("No URL");

  if (!isAllowed(target)) {
    return res.send("Domain not allowed");
  }

  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        "user-agent": req.headers["user-agent"],
        "cookie": req.headers["cookie"] || ""
      },
      body: req.method === "POST" ? JSON.stringify(req.body) : undefined
    });

    const contentType = response.headers.get("content-type");

    // forward cookies
    const setCookie = response.headers.raw()["set-cookie"];
    if (setCookie) {
      res.setHeader("set-cookie", setCookie);
    }

    // HTML rewrite
    if (contentType && contentType.includes("text/html")) {
      const text = await response.text();
      const rewritten = rewriteHTML(text, target);
      res.send(rewritten);
    } else {
      // assets (css/js/images)
      const buffer = await response.buffer();
      res.set("content-type", contentType);
      res.send(buffer);
    }

  } catch (err) {
    res.send("Proxy error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log("Running on http://localhost:" + PORT);
});
