/* アプリの設定。デプロイ前に値を入れる（手順は docs/PWA-API設計.md）。
   ※ここに入れる値は公開されても問題ないもの（API の URL と OAuth クライアントID）だけ。パスワードやトークンは入れない。 */
window.CP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyrmkNQUEaXvBw-iq2mhbeP8gMsYEDIenRfYWbrZ_thaKvlBbGUkiil3tVgevJJsn2iSQ/exec',              // 例: https://script.google.com/macros/s/xxxxxxxx/exec  （API用デプロイのURL）
  PASSWORD_LOGIN: true,     // 学籍番号＋パスワードのログイン（サーバーのスクリプトプロパティ API_PASSWORD_LOGIN=true も必要）
  PC_URL: 'https://script.google.com/a/macros/tng.ac.jp/s/AKfycbwVlESvz8ekI5HzaUJufxInc1j6jU6zmOcPpdgxxDOrC146SszkEAfsbYfeiuDLxNdaNw/exec?page=student'                // 「PC版」リンクの行き先（今のGASウェブアプリのURL + ?page=student）
};
