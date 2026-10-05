/* アプリの設定。デプロイ前に値を入れる（手順は docs/PWA-API設計.md）。
   ※ここに入れる値は公開されても問題ないもの（API の URL と OAuth クライアントID）だけ。パスワードやトークンは入れない。 */
window.CP_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbyC6UpoSywbmgXVxxDdw69D4bmcFomR76CN_nd-ltsQ7CHNFRy8dEmon-L4ICAaIQKXfA/exec',              // 例: https://script.google.com/macros/s/xxxxxxxx/exec  （API用デプロイのURL）
  GOOGLE_CLIENT_ID: '375245821863-r675i3dngn5i9pp30h5npc56s97qfue0.apps.googleusercontent.com',     // 例: 123456789-abc.apps.googleusercontent.com
  ALLOWED_DOMAIN: 'tng.ac.jp',
  PC_URL: 'https://script.google.com/a/macros/tng.ac.jp/s/AKfycbwZZDEODSUdMJRoHZ7EARaC61_w2DFWBMiv4GSYDFj8Ksmy6qew3MaXXfXpn6VWainAuA/exec?page=student'                // 「PC版」リンクの行き先（今のGASウェブアプリのURL + ?page=student）
};
