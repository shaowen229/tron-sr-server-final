const express = require('express');
const cors = require('cors');
const axios = require('axios');
const app = express();

// 🔴 【优先级最高】根路径 / 强制重定向到 /index.html（100%解决冲突）
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// 中间件：跨域+JSON解析
app.use(cors());
app.use(express.json());

// 🔴 所有API接口，仅 /api/ 开头，绝对不碰根路径
// 健康检查接口（仅 /api/health 可访问）
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '波场SR监控后端正常运行',
    timestamp: new Date().toISOString()
  });
});

// 获取最新区块接口
app.get('/api/block/latest', async (req, res) => {
  try {
    const { data } = await axios.get('https://api.trongrid.io/wallet/getnowblock');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: '获取区块失败', details: err.message });
  }
});

// 单个区块查询接口（高度/哈希）
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

// 🔴 静态文件服务（兜底 /index.html 等静态资源）
app.use(express.static(__dirname));

// Railway动态端口（绝对不能写死3000！）
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ 服务启动成功，运行端口：${PORT}`);
});
