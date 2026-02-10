<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html lang="en">
<head>
  <title>Sitemap — BiggyIndex</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1a1a2e;background:#f8f9fa;padding:2rem}
    h1{font-size:1.5rem;margin-bottom:.25rem}
    p.desc{color:#666;margin-bottom:1.5rem;font-size:.9rem}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08)}
    th{background:#1a1a2e;color:#fff;text-align:left;padding:.6rem 1rem;font-size:.8rem;font-weight:500;text-transform:uppercase;letter-spacing:.04em}
    td{padding:.5rem 1rem;border-bottom:1px solid #eee;font-size:.85rem;vertical-align:top}
    tr:last-child td{border-bottom:none}
    tr:hover td{background:#f0f4ff}
    a{color:#2563eb;text-decoration:none}
    a:hover{text-decoration:underline}
    .alt{display:inline-block;background:#e8edf3;color:#444;padding:1px 6px;border-radius:3px;font-size:.75rem;margin:1px 2px}
    .count{color:#888;font-size:.85rem;margin-bottom:1rem}
  </style>
</head>
<body>
  <h1>&#x1F5FA; XML Sitemap</h1>
  <p class="desc">This sitemap is generated for search engines. Below is a human-readable view.</p>

  <!-- Sitemap Index -->
  <xsl:if test="sitemap:sitemapindex">
    <p class="count"><xsl:value-of select="count(sitemap:sitemapindex/sitemap:sitemap)"/> sitemaps</p>
    <table>
      <tr><th>#</th><th>Sitemap URL</th></tr>
      <xsl:for-each select="sitemap:sitemapindex/sitemap:sitemap">
        <tr>
          <td><xsl:value-of select="position()"/></td>
          <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
        </tr>
      </xsl:for-each>
    </table>
  </xsl:if>

  <!-- URL Set -->
  <xsl:if test="sitemap:urlset">
    <p class="count"><xsl:value-of select="count(sitemap:urlset/sitemap:url)"/> URLs</p>
    <table>
      <tr><th>#</th><th>URL</th><th>Priority</th><th>Change Freq</th><th>Last Modified</th><th>Alternates</th></tr>
      <xsl:for-each select="sitemap:urlset/sitemap:url">
        <tr>
          <td><xsl:value-of select="position()"/></td>
          <td><a href="{sitemap:loc}"><xsl:value-of select="sitemap:loc"/></a></td>
          <td><xsl:value-of select="sitemap:priority"/></td>
          <td><xsl:value-of select="sitemap:changefreq"/></td>
          <td><xsl:value-of select="substring(sitemap:lastmod,1,10)"/></td>
          <td>
            <xsl:for-each select="xhtml:link[@rel='alternate']">
              <span class="alt"><xsl:value-of select="@hreflang"/></span>
            </xsl:for-each>
          </td>
        </tr>
      </xsl:for-each>
    </table>
  </xsl:if>
</body>
</html>
</xsl:template>
</xsl:stylesheet>
