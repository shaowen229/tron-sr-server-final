const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

// 中间件：允许跨域、解析JSON
app.use(cors());
app.use(express.json());

// 健康检查接口（Railway 自动检测用，确保服务正常）
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '波场SR监控后端服务正常运行',
    timestamp: new Date().toISOString()
  });
});

// 波场最新区块接口（前端调用用）
app.get('/api/block/latest', async (req, res) => {
  try {
    const response = await axios.get('https://api.trongrid.io/wallet/getnowblock');
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ 
      error: '获取区块数据失败', 
      details: error.message 
    });
  }
});

// 🔴 核心修复：Railway 必须用环境变量 PORT，绝对不能写死！
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ 服务启动成功，运行在端口：${PORT}`);
});
