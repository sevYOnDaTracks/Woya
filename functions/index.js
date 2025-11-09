const {onRequest} = require("firebase-functions/v2/https");
const nodemailer = require("nodemailer");
const cors = require("cors")({origin: true});
const puppeteer = require("puppeteer");
const express = require("express");

// Transport Hostinger pour woya.shop
const transporter = nodemailer.createTransport({
  host: "smtp.hostinger.com",
  port: 465,
  secure: true,
  auth: {
    user: "no-reply@woya.shop",
    pass: "Rennes*12301",
  },
});

const app = express();
app.use(express.json());
app.use(cors);

app.post("/sendEmail", (req, res) => {
  const {to, subject, html} = req.body;

  if (!to || !subject || !html) {
    return res.status(400).send("Payload must include to, subject and html");
  }

  transporter.sendMail({
    from: "no-reply@woya.shop",
    to,
    subject,
    html,
  }, (error, info) => {
    if (error) {
      console.error("Erreur lors de l'envoi de l'email", error);
      return res.status(500).send(error.toString());
    }
    console.log("Email envoyé avec succès", info.response);
    return res.status(200).send("Email envoyé: " + info.response);
  });
});

app.post("/generatePdf", async (req, res) => {
  const {html} = req.body;
  if (!html) {
    console.error("Missing HTML content");
    return res.status(400).send("Missing HTML content");
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ],
    });
    const page = await browser.newPage();
    await page.setContent(html, {waitUntil: "networkidle0"});

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "20mm",
        bottom: "20mm",
        left: "10mm",
        right: "10mm",
      },
      preferCSSPageSize: true,
    });

    await browser.close();
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=generated.pdf",
    });
    res.send(pdf);
  } catch (error) {
    console.error("Error generating PDF:", error);
    res.status(500).send("Internal Server Error");
  }
});

exports.api = onRequest(app);
