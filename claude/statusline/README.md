# claude-statusline

Claude Code 用のカスタムステータスライン。Rust 製。

![statusline](https://github.com/user-attachments/assets/f7aac4ac-e11c-4749-9493-226c432e31c4)

## 表示内容

| 行 | 項目 | 説明 |
|----|------|------|
| 1 | モデル名 | 使用中のモデル（太字） |
| 1 | Git ブランチ | ブランチ名 + 変更行数（+/-） |
| 2 | ctx | コンテキストウィンドウ使用率 |
| 2 | 5h | 5時間レートリミット使用率（リセットまでの残り時間付き） |
| 2 | 7d | 7日間レートリミット使用率（リセットまでの残り時間付き） |

## ビルド

```bash
cargo build --release
```

## 設定

`claude/settings.json` の `statusLine` でバイナリを指定：

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.local/bin/claude-statusline",
    "padding": 0
  }
}
```
