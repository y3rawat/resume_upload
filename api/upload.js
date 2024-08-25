const { MongoClient, Binary } = require('mongodb');
const Busboy = require('busboy');
const cors = require('cors');
const pdfParse = require('pdf-parse');
const axios = require('axios');

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

  // Handle OPTIONS request for preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Check if it's a POST request
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  // Set headers for streaming response
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Transfer-Encoding', 'chunked');

  const busboy = Busboy({ headers: req.headers });
  let fileBuffer = null;
  let fileName = '';
  let fileType = '';
  let formData = {};

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
    formData[fieldname] = val;
  });

  busboy.on('finish', async () => {
    if (!fileBuffer) {
      res.status(400).json({ success: false, message: 'No file uploaded' });
      return;
    }

    try {
      // Step 1: Extract text from PDF
      res.write(JSON.stringify({ status: 'extracting' }) + '\n');
      const pdfData = await pdfParse(fileBuffer);
      const extractedText = pdfData.text || '';

      // Step 2: Send data to API
      res.write(JSON.stringify({ status: 'fetching' }) + '\n');
      const externalApiUrl = `https://resume-test-api.vercel.app/submit`;
      const apiResponse = await axios.post(externalApiUrl, {
        fileName: fileName,
        fileType: fileType,
        job_description: formData.job_description,
        additional_information: formData.additional_information,
        experience: formData.experience,
        extractedText: extractedText,
        api: formData.api
      });

      // Step 3: Send final response
      res.write(JSON.stringify({ 
        status: 'complete', 
        extractedText: extractedText, 
        apiResponse: apiResponse.data 
      }) + '\n');
      res.end();

      // Perform MongoDB insertion asynchronously
      try {
        const uri = process.env.MONGODB_URI;
        if (!uri) {
          throw new Error('Server configuration error');
        }

        const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });
        await client.connect();
        const database = client.db('db');
        const collection = database.collection('items');

        await collection.insertOne({
          filename: fileName,
          filetype: fileType,
          filedata: new Binary(fileBuffer),
          extractedText: extractedText,
          formData: formData,
          apiResponse: apiResponse.data
        });

        await client.close();
      } catch (error) {
        console.error("Error inserting data into MongoDB:", error);
      }

    } catch (error) {
      console.error("Error processing request:", error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  busboy.on('error', (error) => {
    console.error("Busboy error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  });

  req.pipe(busboy);
};