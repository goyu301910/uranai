# 今日の運勢ブレンド

複数の占いソースを取得し、順位とスコアを平均して「今日の運勢」として表示するスマホ対応Webアプリです。

## 起動

```powershell
npm start
```

起動後、ブラウザで `http://localhost:4173` を開きます。

## GitHub Pagesで公開

このアプリはGitHub Pages向けに静的公開できます。

```powershell
npm run generate
```

`public/data/fortune.json` が生成されます。GitHubでは `.github/workflows/pages.yml` が毎日 00:15 JST に同じ生成処理を実行し、`public/` をGitHub Pagesへデプロイします。手動更新したい場合はGitHub Actionsの `Deploy GitHub Pages` を `Run workflow` で実行します。

## 仕組み

- `config/sources.json` の `enabled: true` なソースを日付・星座ごとに取得します。
- `ranked-html` は実サイトの12星座ランキングページを取得し、該当星座の順位と本文を抽出します。
- 各ソースの点数、順位、星数、本文傾向を 0〜100 点へ正規化します。
- 順位が取れたソースから平均順位を計算し、重み付き平均で総合スコア・ラッキーカラー・今日の一手を生成します。
- フロントエンドは1分ごとに日本時間の日付変更を確認し、日付が変わったら自動更新します。

## 現在の取得ソース

- dメニュー 12星座占い
- ルナリエ 今日の星座占い
- GoisuNet 今日の運勢
- ウラシル 星座占い
- うらなえる 今日の運勢
- ENJYO 今日の運勢

## 外部サイト/APIを追加する

`config/sources.json` にランキングHTML、JSON API、HTML ページの設定を追加します。スクレイピングは対象サイトの利用規約と robots.txt を確認し、許可されている範囲で使ってください。

ランキングHTML の例:

```json
{
  "id": "my-ranking-source",
  "name": "12星座ランキング",
  "type": "ranked-html",
  "enabled": true,
  "weight": 1,
  "rankTotal": 12,
  "url": "https://example.com/today-ranking",
  "blockStartRegex": "総合ランキング",
  "blockEndRegex": "恋愛運ランキング"
}
```

JSON API の例:

```json
{
  "id": "my-json-source",
  "name": "公式占いAPI",
  "type": "json",
  "enabled": true,
  "weight": 1,
  "url": "https://example.com/api/fortune?date={date}&sign={sign}",
  "scorePath": "score",
  "textPath": "message"
}
```

HTML ページの例:

```json
{
  "id": "my-html-source",
  "name": "占いページ",
  "type": "html",
  "enabled": true,
  "weight": 1,
  "url": "https://example.com/fortune/{sign}/{date}",
  "scoreRegex": "score[\"'\\s:=-]+(\\d{1,3})",
  "textRegex": "<p class=\"fortune\">([\\s\\S]*?)</p>"
}
```

「あらゆる占いサイト」は技術的・法的に一括取得できないため、このアプリでは「許可を得て登録した全ソース」を平均対象にします。
