#!/bin/bash

# 自动生成 SSL 证书脚本
# 使用 mkcert 生成开发环境证书，支持 Chrome 浏览器验证

echo "开始使用 mkcert 生成 SSL 证书..."

# 检查是否提供了地址参数
if [ -z "$1" ]; then
  echo "使用方法: $0 <地址列表，逗号分隔>"
  echo "例如: $0 192.168.3.10,54.255.8.37"
  echo "       $0 192.168.3.10,192.168.1.100,your-tunnel-domain.com"
  exit 1
fi

# 将地址列表转换为 mkcert 参数格式
IFS=',' read -r -a addresses <<< "$1"
mkcert_args="localhost 127.0.0.1 ::1"

for addr in "${addresses[@]}"; do
  # 去除空格
  addr=$(echo "$addr" | xargs)
  mkcert_args+=" $addr"
done

echo "证书将包含以下地址: $mkcert_args"

# 根据操作系统类型调用对应的 mkcert 工具
echo "生成证书和私钥文件..."

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MKCERT_DIR="${SCRIPT_DIR}/mkcert"

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  # Windows Git Bash 环境
  MKCERT_BIN="${MKCERT_DIR}/mkcert-v1.4.4-windows-amd64.exe"
  echo "检测到 Windows 环境，使用 ${MKCERT_BIN}"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS 环境
  MKCERT_BIN="${MKCERT_DIR}/mkcert-v1.4.4-darwin-amd64"
  echo "检测到 macOS 环境，使用 ${MKCERT_BIN}"
  chmod +x "$MKCERT_BIN" 2>/dev/null || true
else
  # Linux 环境
  MKCERT_BIN="${MKCERT_DIR}/mkcert-v1.4.4-linux-amd64"
  echo "检测到 Linux 环境，使用 ${MKCERT_BIN}"
  chmod +x "$MKCERT_BIN" 2>/dev/null || true
fi

# 检查 mkcert 工具是否存在
if [[ ! -f "$MKCERT_BIN" ]]; then
  echo "错误: 找不到 mkcert 工具: $MKCERT_BIN"
  echo "请确保 mkcert 目录包含对应平台的工具文件"
  exit 1
fi

# 执行 mkcert 安装 CA
echo "正在安装 CA..."
"$MKCERT_BIN" -install

# 执行 mkcert 生成证书
"$MKCERT_BIN" -key-file mycert.key -cert-file mycert.crt $mkcert_args

# 检查证书是否生成成功
if [[ ! -f "mycert.crt" || ! -f "mycert.key" ]]; then
  echo "错误: 证书生成失败"
  echo "使用的 mkcert 工具: $MKCERT_BIN"
  echo "请检查工具文件是否损坏或系统是否兼容"
  exit 1
fi

echo "证书生成成功!"

# 生成 Fastify 专用的证书文件
echo "生成 Fastify 专用证书文件..."
cp mycert.crt public-cert.pem
cp mycert.key private-key.pem

echo "文件生成完成:"
echo "  - mycert.crt (证书文件)"
echo "  - mycert.key (私钥文件)"
echo "  - public-cert.pem (Fastify 证书文件)"
echo "  - private-key.pem (Fastify 私钥文件)"

# 显示证书信息
echo ""
echo "证书信息:"
echo "  - 证书文件: mycert.crt"
echo "  - 私钥文件: mycert.key"
echo "  - 包含的域名/IP: $mkcert_args"

echo ""
echo "🎉 mkcert 证书生成完成！"
echo ""
echo "📢 重要信息："
echo "  - mkcert 已自动将 CA 根证书安装到系统信任存储"
echo "  - 浏览器可能需要重启以识别新安装的证书"

echo ""
echo "📢 下一步操作："
echo "  1. 重启 Chrome 浏览器"
echo "  2. 访问 https://localhost 或您配置的其他地址"
echo "  3. 证书应该显示为有效和受信任的"
echo ""
echo "📝 故障排除："
echo "  如果证书仍不受信任，请尝试："
echo "  - 运行: \"$MKCERT_BIN\" -install"
echo "  - 重启浏览器"
echo "  - 清除浏览器缓存"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"