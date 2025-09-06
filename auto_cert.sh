#!/bin/bash


# openssl req -x509 -newkey rsa:4096 -days 365 -nodes -keyout private-key.pem -out public-cert.pem -subj "/C=CN/ST=Beijing/L=Beijing/O=Development/OU=IT/CN=localhost" -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:0.0.0.0,IP:192.168.3.23,IP:192.168.3.43,IP:192.168.3.38,IP:114.132.85.89,IP:13.250.52.131,IP:192.168.3.68"


# 检查是否提供了 IP 地址参数
if [ -z "$1" ]; then
  echo "请提供以逗号分隔的 IP 地址列表。"
  exit 1
fi

# 将 IP 地址列表转换为 OpenSSL 的 subjectAltName 格式
IFS=',' read -r -a ips <<< "$1"
alt_names="DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:0.0.0.0"
for ip in "${ips[@]}"; do
  alt_names+=",IP:${ip}"
done

# 为不同操作系统设置正确的 subj 格式
subj="/C=CN/ST=Beijing/L=Beijing/O=Development/OU=IT/CN=localhost"

# 在 Windows Git Bash 环境中使用不同的 OpenSSL 命令格式
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  # 使用 req 文件方式来避免路径解析问题
  cat > req.conf <<EOF
[req]
default_bits = 2048
default_md = sha256
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = CN
ST = Beijing
L = Beijing
O = Development
OU = IT
CN = localhost

[v3_req]
subjectAltName = ${alt_names}
EOF

  # 生成自签名证书和私钥，使用配置文件方式
  openssl req -x509 -newkey rsa:2048 -keyout mycert.key -out mycert.crt -days 365 -nodes -config req.conf
  
  # 清理临时文件
  rm req.conf
else
  # 其他系统保持原有方式
  openssl req -x509 -newkey rsa:2048 -keyout mycert.key -out mycert.crt -days 365 -nodes \
    -subj "$subj" \
    -addext "subjectAltName = ${alt_names}" \
    -batch
fi

# 根据操作系统添加证书到信任存储
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain mycert.crt
  echo "证书已添加到 macOS 系统信任存储。"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  # Windows (Git Bash)
  # 检查是否具有管理员权限
  net session > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    certutil -addstore "Root" mycert.crt
    echo "证书已添加到 Windows 信任根证书存储。"
  else
    echo "错误: 在 Windows 上安装证书需要管理员权限。请以管理员身份运行此脚本。"
    exit 1
  fi
else
  echo "不支持的操作系统：$OSTYPE"
  exit 1
fi