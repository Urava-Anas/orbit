import {
  degrees,
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import { verifyFoundryCertificate } from "@/lib/certificates";

export const runtime = "nodejs";

function drawCentered(
  page: PDFPage,
  text: string,
  y: number,
  size: number,
  font: PDFFont,
  color = rgb(0.12, 0.14, 0.13),
) {
  const width = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: (page.getWidth() - width) / 2,
    y,
    size,
    font,
    color,
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const certificate = await verifyFoundryCertificate(token);
  if (!certificate) {
    return new Response("Certificate not found", { status: 404 });
  }

  const document = await PDFDocument.create();
  const page = document.addPage([842, 595]);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.12, 0.3, 0.2);
  const red = rgb(0.83, 0.22, 0.18);
  const ink = rgb(0.12, 0.14, 0.13);
  const muted = rgb(0.4, 0.44, 0.41);
  const ivory = rgb(0.98, 0.96, 0.9);
  const valid = certificate.status === "issued";

  page.drawRectangle({
    x: 0,
    y: 0,
    width: 842,
    height: 595,
    color: ivory,
  });
  page.drawRectangle({
    x: 24,
    y: 24,
    width: 794,
    height: 547,
    borderColor: valid ? green : red,
    borderWidth: 2,
  });
  page.drawRectangle({
    x: 34,
    y: 34,
    width: 774,
    height: 527,
    borderColor: rgb(0.75, 0.68, 0.49),
    borderWidth: 0.7,
  });

  drawCentered(page, "ORBIT  /  URAVA FOUNDRY", 526, 11, bold, green);
  drawCentered(page, "VERIFIED ACHIEVEMENT RECORD", 504, 8, regular, muted);
  drawCentered(page, certificate.title, 445, 28, bold, ink);
  drawCentered(page, "This verified record is presented to", 409, 11, regular, muted);
  drawCentered(page, certificate.student_name, 358, 30, bold, green);
  drawCentered(page, certificate.foundry_id, 333, 10, bold, muted);

  const statementLines = wrapText(certificate.statement, regular, 12, 620);
  statementLines.slice(0, 4).forEach((line, index) => {
    drawCentered(page, line, 286 - index * 18, 12, regular, ink);
  });

  const issued = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(certificate.issued_at));
  page.drawText("CERTIFICATE NUMBER", {
    x: 86,
    y: 142,
    size: 8,
    font: bold,
    color: muted,
  });
  page.drawText(certificate.certificate_number, {
    x: 86,
    y: 125,
    size: 11,
    font: bold,
    color: ink,
  });
  page.drawText("ISSUED", {
    x: 349,
    y: 142,
    size: 8,
    font: bold,
    color: muted,
  });
  page.drawText(issued, {
    x: 349,
    y: 125,
    size: 11,
    font: bold,
    color: ink,
  });
  page.drawText(valid ? "STATUS: VALID" : "STATUS: REVOKED", {
    x: 650,
    y: 125,
    size: 10,
    font: bold,
    color: valid ? green : red,
  });

  const verifyUrl = new URL(request.url);
  verifyUrl.pathname = `/certificates/${token}`;
  page.drawText(`Verify: ${verifyUrl.toString()}`, {
    x: 86,
    y: 81,
    size: 8,
    font: regular,
    color: muted,
  });
  page.drawText(
    "Verified training evidence only. No job, project, or income guarantee.",
    {
      x: 86,
      y: 62,
      size: 8,
      font: regular,
      color: muted,
    },
  );

  if (!valid) {
    page.drawText("REVOKED", {
      x: 270,
      y: 245,
      size: 64,
      font: bold,
      color: rgb(0.88, 0.67, 0.64),
      rotate: degrees(18),
      opacity: 0.5,
    });
  }

  document.setTitle(certificate.title);
  document.setSubject(certificate.certificate_number);
  document.setCreator("Orbit · Urava Foundry");
  const bytes = await document.save();
  const safeName = certificate.certificate_number.replaceAll(/[^A-Z0-9-]/g, "");

  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeName}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
