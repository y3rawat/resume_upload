const axios = require('axios');
const cors = require('cors');

// Helper function to run middleware
const runMiddleware = (req, res, fn) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

module.exports = async (req, res) => {
  // Run the CORS middleware
  await runMiddleware(req, res, cors());

  if (req.method === 'POST') {
    try {
      const { job_description, additional_information, experience, extractedText, api, companyName, position } = req.body;

      const externalApiUrl = `https://c2c-resume-analysis-api-profile.onrender.com//submit`;
      const apiResponse = await axios.post(externalApiUrl, {
        job_description,
        additional_information,
        experience,
        extractedText,
        api,
        companyName,
        position
        
      });

      res.json({
        success: true,
        apiResponse: apiResponse.data
      });
    } catch (error) {
      console.error("Error processing request:", error);
      res.status(500).json({
        success: false,
        message: 'Error analyzing resume',
        error: error.message
      });
    }
  } else {
    res.status(405).json({ success: false, message: 'Method not allowed' });
  }
};
