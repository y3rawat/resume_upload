const Busboy = require('busboy');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');

const safeEncodeURIComponent = (str) => {
  return encodeURIComponent(str).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16));
};

module.exports = async (req, res) => {
  // Enable CORS
  await new Promise((resolve, reject) => {
    cors()(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });

  // Handle POST requests for file upload
  if (req.method === 'POST') {
    return new Promise((resolve, reject) => {
      const busboy = Busboy({ headers: req.headers });
      let fileBuffer = null;
      let fileName = '';
      let fileType = '';
      let formData = {};
      let specialCharsWarning = null;

      busboy.on('file', (fieldname, file, { filename, mimeType }) => {
        fileName = filename;
        fileType = mimeType;
        const chunks = [];
        file.on('data', (data) => {
          chunks.push(data);
        });
        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
        });
      });

      busboy.on('field', (fieldname, val) => {
        if (fieldname === 'specialCharsWarning') {
          specialCharsWarning = JSON.parse(val);
        } else {
          formData[fieldname] = val;
        }
      });

      busboy.on('finish', async () => {
        if (!fileBuffer) {
          console.error("No file received");
          res.status(400).json({ success: false, message: 'No file uploaded' });
          return resolve();
        }

        let extractedText = '';
        try {
          const pdfData = await pdfParse(fileBuffer);
          extractedText = pdfData.text || '';
        } catch (pdfError) {
          console.error("Error parsing PDF:", pdfError);
          extractedText = 'Error extracting text from PDF';
        }

        try {
          const externalApiUrl = `https://c2c-resume-analysis-api-profile.onrender.com//submit`;
          console.log("Sending request to external API:", externalApiUrl);
          console.log("Request data:", { ...formData, extractedText, fileName, fileType });
          
          const apiResponse = await axios.post(externalApiUrl, {
            ...formData,
            extractedText,
            fileName,
            fileType
          });

          console.log("API Response:", apiResponse.data);
          const safeApiResponse = safeEncodeURIComponent(JSON.stringify(apiResponse.data));
          const redirectUrl = `/result.html?success=true&apiResponse=${safeApiResponse}${specialCharsWarning ? `&specialCharsWarning=${safeEncodeURIComponent(JSON.stringify(specialCharsWarning))}` : ''}`;

          res.writeHead(302, { Location: redirectUrl });
          res.end();
        } catch (error) {
          console.error("Error processing request:", error);
          if (error.response) {
            console.error("Error response from external API:", error.response.data);
          }
          const safeErrorMessage = safeEncodeURIComponent(error.message);
          const redirectUrl = `/result.html?success=false&errorMessage=${safeErrorMessage}${specialCharsWarning ? `&specialCharsWarning=${safeEncodeURIComponent(JSON.stringify(specialCharsWarning))}` : ''}`;
          res.writeHead(302, { Location: redirectUrl });
          res.end();
        }

        resolve();
      });

      busboy.on('error', (error) => {
        console.error("Busboy error:", error.message);
        const redirectUrl = `/result.html?success=false&errorMessage=${encodeURIComponent(error.message)}`;
        res.writeHead(302, { Location: redirectUrl });
        res.end();
        resolve();
      });

      req.pipe(busboy);
    });
  } else {
    // Method not allowed for other HTTP methods
    console.log("Method not allowed:", req.method);
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
};
