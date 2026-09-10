export default function handler(req, res) {
  res.status(200).json({
    gasApiUrl: process.env.ENV_GAS_API_URL,
    liffId: process.env.ENV_MY_LIFF_ID
  });
}