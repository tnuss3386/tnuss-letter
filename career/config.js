// ★ CareerPort（生徒用）のウェブアプリのURL。画面の「CareerPort を開く」ボタンが、ここを開きます。
var CAREERPORT_URL = 'https://script.google.com/a/macros/tng.ac.jp/s/AKfycbwZZDEODSUdMJRoHZ7EARaC61_w2DFWBMiv4GSYDFj8Ksmy6qew3MaXXfXpn6VWainAuA/exec?page=mobile';

// true: 入口を開いたら、アプリの画面の中にそのままCareerPortを表示する（上下の「完了」「戻る・進む」のバーが出ない）。
//   ただし、枠の中ではGoogleのログインが通らない端末があります。その場合は false にすると、
//   ボタンから外のブラウザで開く方式に戻ります（バーは出ますが、確実にログインできます）。
//   embed=true でも、入口のアドレスの末尾に #link を付けて開くと、ボタンの画面になります。
var CAREERPORT_EMBED = true;

var APP_TITLE = 'TNUSS CareerPort';
var APP_TAGLINE = '生徒の学びの記録';
var SCHOOL_NAME = '土浦日本大学中等教育学校';
