const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const axios = require('axios'); // 确定使用 axios，彻底解决兼容问题

const app = express();
app.use(cors());
app.use(express.json());

// 连接SQLite数据库（自动生成文件）
const db = new sqlite3.Database('./tron_sr.db', (err) => {
  if (err) console.error('❌ 数据库连接失败：', err);
  else console.log('✅ 数据库连接成功，开始后台监控波场SR');
});

// 创建数据表
db.run(`CREATE TABLE IF NOT EXISTS block_history (
  height INTEGER PRIMARY KEY,
  hash TEXT,
  time TEXT,
  srAddr TEXT
)`);
db.run(`CREATE TABLE IF NOT EXISTS sr_block (
  height INTEGER PRIMARY KEY,
  hash TEXT,
  time TEXT,
  srAddr TEXT
)`);

// 全局配置（默认监控1个SR，可通过前端设置修改）
let targetSR = ['TQhuVjZtmp6k4fPmGZLr4wyXdziCVSPkEX'];
let lastProcessedHeight = 0;
const TRON_API = 'https://api.trongrid.io/wallet';
const POLL_INTERVAL = 1000; // 1秒轮询一次

// 工具函数
function hex2Base58(hex) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  if (!hex) return '';
  if (hex.startsWith('41')) hex = hex.slice(2);
  let num = BigInt('0x' + hex);
  let res = '';
  while (num > 0n) {
    res = ALPHABET[Number(num % 58n)] + res;
    num = num / 58n;
  }
  return res.padStart(34, '1');
}
function shortenAddr(a) { return a.length > 10 ? a.slice(0, 8) + '...' + a.slice(-4) : a; }
function formatHash(h) { return h ? h.slice(0, 5) + '…' + h.slice(-8) : ''; }
function getHashOddEven(hash) {
  const digits = hash ? hash.replace(/[^0-9]/g, '') : '';
  if (!digits) return { tag: '', num: 0, isOdd: false };
  const last = parseInt(digits.slice(-1));
  return { num: last, tag: last % 2 === 0 ? '双' : '单', isOdd: last % 2 === 1 };
}

// 核心：后台监控函数（使用 Axios，代码逻辑极简，零报错）
async function syncBlock() {
  try {
    // 1. 获取最新区块
    const nowRes = await axios.get(`${TRON_API}/getnowblock`);
    const now = nowRes.data;
    
    if (!now?.block_header?.raw_data) {
      console.log('⏭️ 跳过无效区块数据');
      return;
    }

    const latestHeight = now.block_header.raw_data.number;
    if (lastProcessedHeight === 0) lastProcessedHeight = latestHeight;
    if (latestHeight <= lastProcessedHeight) {
      // console.log(`当前已是最新高度: ${latestHeight}`);
      return;
    }

    // 2. 拉取未处理的区块
    for (let h = lastProcessedHeight + 1; h <= latestHeight; h++) {
      try {
        const blockRes = await axios.post(`${TRON_API}/getblockbynum`, { num: h });
        const block = blockRes.data;

        if (!block?.block_header?.raw_data) {
          console.log(`⏭️ 区块 ${h} 数据异常，跳过`);
          continue; // 这里在 for 循环内，continue 合法
        }

        const hash = block.blockID;
        const time = new Date(block.block_header.raw_data.timestamp).toLocaleTimeString();
        const srAddr = hex2Base58(block.block_header.raw_data.witness_address);
        
        // 去重存储全网区块
        db.run(`INSERT OR IGNORE INTO block_history VALUES (?, ?, ?, ?)`, [h, hash, time, srAddr]);
        
        // 目标SR出块，单独存储
        if (targetSR.includes(srAddr)) {
          db.run(`INSERT OR IGNORE INTO sr_block VALUES (?, ?, ?, ?)`, [h, hash, time, srAddr]);
          console.log(`📌 监控到目标SR出块：高度 ${h}，出块者 ${shortenAddr(srAddr)}`);
        }

        lastProcessedHeight = h;
      } catch (innerErr) {
        console.log(`❌ 处理区块 ${h} 时出错：`, innerErr.message);
        continue;
      }
    }
  } catch (e) {
    console.log(`⚠️  监控临时出错：${e.message}，将在下次轮询重试`);
  }
}

// 前端接口路由
app.get('/api/latest-block', (req, res) => {
  db.get(`SELECT * FROM block_history ORDER BY height DESC LIMIT 1`, (err, row) => {
    if (err) res.json({ code: 0, data: null });
    else {
      if (row) row.oddEven = getHashOddEven(row.hash);
      res.json({ code: 1, data: row });
    }
  });
});
app.get('/api/block-history', (req, res) => {
  const { page = 1, size = 50 } = req.query;
  const offset = (page - 1) * size;
  db.all(`SELECT * FROM block_history ORDER BY height DESC LIMIT ? OFFSET ?`, [size, offset], (err, rows) => {
    rows = rows ? rows.map(r => ({ ...r, oddEven: getHashOddEven(r.hash) })) : [];
    res.json({ code: 1, data: rows });
  });
});
app.get('/api/sr-block', (req, res) => {
  const { srAddr = '', page = 1, size = 50 } = req.query;
  const offset = (page - 1) * size;
  let sql = `SELECT * FROM sr_block ORDER BY height DESC LIMIT ? OFFSET ?`;
  const params = [size, offset];
  if (srAddr) {
    sql = `SELECT * FROM sr_block WHERE srAddr = ? ORDER BY height DESC LIMIT ? OFFSET ?`;
    params.unshift(srAddr);
  }
  db.all(sql, params, (err, rows) => {
    rows = rows ? rows.map(r => ({
      ...r,
      oddEven: getHashOddEven(r.hash),
      srIndex: targetSR.indexOf(r.srAddr) + 1
    })) : [];
    res.json({ code: 1, data: rows });
  });
});
app.post('/api/set-sr', (req, res) => {
  const { srList } = req.body;
  if (Array.isArray(srList) && srList.length > 0) {
    targetSR = srList.filter(a => a.startsWith('T') && a.length === 34);
    res.json({ code: 1, msg: 'SR地址设置成功', data: targetSR });
    console.log(`✅ 后端更新监控SR：${targetSR.map(shortenAddr).join('、')}`);
  } else {
    res.json({ code: 0, msg: 'SR地址格式错误' });
  }
});

// 启动服务
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 后端服务启动成功：http://localhost:${PORT}`);
  syncBlock(); // 立即执行一次
  setInterval(syncBlock, POLL_INTERVAL); // 开启定时轮询
});