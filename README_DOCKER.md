# 腾讯云东京机房 Ubuntu 服务器 Docker 部署指南

本指南详细介绍如何将本项目（基于 React 18 + Vite + Express + SQLite 的全栈量化监控系统）部署到腾讯云东京机房的 Ubuntu 服务器上。由于东京机房地理位置极佳，访问币安 API 的延迟和稳定性都非常优异，使用 Docker 部署更是能够免去复杂的底层环境配置，实现一键启动和稳定持久运行。

---

## 1. 准备 Ubuntu 服务器环境

在开始部署前，请先连接到您的腾讯云 Ubuntu 服务器，并安装 Docker 和 Docker Compose。

### 1.1 安装 Docker & Docker Compose
登录服务器后，运行以下指令进行一键安装：

```bash
# 更新软件包列表
sudo apt update && sudo apt upgrade -y

# 安装 Docker 依赖
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common

# 添加 Docker 官方 GPG 密钥
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

# 添加 Docker 官方源
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 安装 Docker CE
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io

# 安装 Docker Compose V2
sudo apt install -y docker-compose-plugin

# 验证安装是否成功
docker --version
docker compose version
```

### 1.2 开放腾讯云安全组端口
本系统默认运行在 **3000** 端口。
请登录 **腾讯云控制台 -> 您的轻量应用服务器/云服务器 -> 安全组/防火墙**，添加一条入站规则：
*   **协议/端口**：TCP:3000
*   **策略**：允许
*   **来源**：您的公网 IP（推荐限制来源以确保安全）或 `0.0.0.0/0`（全网开放）

---

## 2. 上传项目文件

由于您目前正在 AI Studio 的网页预览端中，您可以通过页面右上角的“下载/导出”功能将项目整体导出为 ZIP 压缩包，或者通过 Git 导出到您的 GitHub 仓库。

### 2.1 推荐上传步骤
1.  在本地电脑解压导出的项目压缩包。
2.  通过 SCP、SFTP 或 FinalShell 等连接工具，将项目文件夹上传到服务器的指定目录下（例如 `/root/binance-monitor`）。
    *   *注：上传时无需上传 `node_modules`、`dist` 和 `trading.db`，Docker 构建时会自动拉取并全新生成。*

---

## 3. 使用 Docker 一键运行

项目内已为您配置好了极简的 `Dockerfile`（多阶段构建，编译和运行分离，体积极小且安全）和 `docker-compose.yml`（管理容器、环境和本地存储盘卷）。

### 3.1 启动容器
进入到上传项目的根目录下，运行以下指令：

```bash
# 进入项目目录
cd /root/binance-monitor

# 在后台启动容器并自动编译
sudo docker compose up -d --build
```

### 3.2 验证运行状态
```bash
# 查看正在运行的容器状态
sudo docker compose ps

# 查看实时运行日志（如果程序报错或启动异常可以随时通过此命令排查）
sudo docker compose logs -f
```

启动成功后，即可在浏览器中访问：`http://您的云服务器公网IP:3000`。

---

## 4. 关键配置与数据备份（极重要）

### 4.1 数据的持久化保存
本程序使用高效的 SQLite 本地数据库，在 `docker-compose.yml` 中已经自动将容器内的数据库目录 `/app/data` 挂载到了主机的 `./data` 目录下。
*   **数据文件路径**：`/root/binance-monitor/data/trading.db`
*   您的**账户设置、历史仓位对账单、监控警报记录**都会实时写入到该文件中。
*   **如何备份**：您只需定期备份服务器上的 `/root/binance-monitor/data` 文件夹即可。即便您更新或重构 Docker 容器，数据也绝不会丢失。

### 4.2 加密密钥配置
为了确保敏感数据安全，保存在数据库中的数据可以通过环境变量进行加盐加密。您可以在 `docker-compose.yml` 的 `environment` 栏目下自定义该值：
```yaml
environment:
  - API_ENCRYPTION_KEY=您的自定义随机高强度密钥
```
*   *提示：如果在容器运行中途修改此 Key，会导致原加密数据解密失败，请谨慎保存。*

---

## 5. 常用运维指令

```bash
# 重启量化监控服务
sudo docker compose restart

# 停止并移除容器（数据在宿主机 data 目录中，非常安全，不会丢失）
sudo docker compose down

# 彻底清理未使用的 Docker 镜像和缓存释放空间（Ubuntu 磁盘不足时使用）
sudo docker image prune -f
```

祝您交易愉快，收益长虹！如有任何关于腾讯云东京服务器的配置问题，请随时向我提问。
