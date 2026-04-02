const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

// 中间件：跨域+JSON解析（必须放在最前面）
app.use(cors());
app.use(express.json());

// 🔴 后端API接口（保留所有功能）
// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '波场SR监控后端正常运行',
    timestamp: new Date().toISOString()
  });
});

// 获取最新区块
app.get('/api/block/latest', async (req, res) => {
  try {
    const { data } = await axios.get('https://api.trongrid.io/wallet/getnowblock');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: '获取区块失败', details: err.message });
  }
});

// 单个区块查询（高度/哈希）
app.get('/api/block/:numOrHash', async (req, res) => {
  try {
    const numOrHash = req.params.numOrHash;
    let response;
    if (!isNaN(numOrHash)) {
      response = await axios.post('https://api.trongrid.io/wallet/getblockbynum', { num: parseInt(numOrHash) });
    } else {
      response = await axios.post('https://api.trongrid.io/wallet/getblockbyid', { value: numOrHash });
    }
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: '查询区块失败', details: err.message });
  }
});

// 🔴 核心修复：添加静态文件服务，根路径自动返回index.html
// 必须放在API接口后面，确保API优先匹配
app.use(express.static(__dirname));

// Railway动态端口（绝对不能写死3000！）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ 服务启动成功，运行端口：${PORT}`);
});
