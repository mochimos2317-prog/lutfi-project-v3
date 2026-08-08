function cleanName(value) {
  return String(value || "lutfi-project")
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "lutfi-project";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.VERCEL_TOKEN;

  if (!token) {
    return res.status(500).json({
      error: "VERCEL_TOKEN belum dipasang di Vercel."
    });
  }

  let html = "";

  if (typeof req.body === "string") {
    html = req.body;
  } else if (Buffer.isBuffer(req.body)) {
    html = req.body.toString("utf8");
  }

  if (!html || !/<html[\s>]/i.test(html)) {
    return res.status(400).json({
      error: "File yang dikirim bukan HTML."
    });
  }

  const size = Buffer.byteLength(html, "utf8");

  if (size > 4 * 1024 * 1024) {
    return res.status(413).json({
      error: "File HTML terlalu besar. Maksimal 4 MB."
    });
  }

  const file = Buffer.from(html, "utf8");

  const crypto = require("crypto");

  const sha = crypto
    .createHash("sha1")
    .update(file)
    .digest("hex");

  const projectName = cleanName(
    req.headers["x-project-name"]
  );

  const upload = await fetch(
    "https://api.vercel.com/v2/now/files",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/html",
        "x-vercel-digest": sha,
        "Content-Length": String(file.length)
      },
      body: file
    }
  );

  if (!upload.ok) {
    const error = await upload.text();

    return res.status(502).json({
      error: "Upload ke Vercel gagal.",
      detail: error.slice(0, 500)
    });
  }

  const deployment = await fetch(
    "https://api.vercel.com/v13/deployments",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: projectName,
        target: "production",
        files: [
          {
            file: "index.html",
            sha: sha,
            size: file.length
          }
        ],
        projectSettings: {
          framework: null
        }
      })
    }
  );

  const data = await deployment
    .json()
    .catch(() => ({}));

  if (!deployment.ok) {
    return res.status(502).json({
      error: "Vercel gagal membuat deployment.",
      detail: data
    });
  }

  return res.status(200).json({
    success: true,
    id: data.id || data.uid,
    url: data.url
      ? `https://${data.url}`
      : null,
    status:
      data.readyState ||
      data.state ||
      "QUEUED"
  });
};
