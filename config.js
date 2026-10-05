// ★ GASで発行した「ウェブアプリのURL」（https://script.google.com/macros/s/.../exec）に置き換えてください
var GAS_URL = 'https://script.google.com/macros/s/AKfycbyepNoPzrB_pS8H-_IB3xXGNG6DhiUZ7kGXGIKmIsXvxkr0Sup0ZFBZdSeq4wgayZE8ww/exec';

// ★ 教員の「Googleでログイン」を使う場合の OAuth クライアントID（Google Cloud の「認証情報」→ ウェブ アプリケーション。
//   承認済みの JavaScript 生成元に、このアプリの URL（https://○○.github.io）を登録）。GAS 側の GOOGLE_CLIENT_ID と同じ値にします。
//   空のままなら、Google ログインのボタンは出ません。
var GOOGLE_CLIENT_ID = '375245821863-r675i3dngn5i9pp30h5npc56s97qfue0.apps.googleusercontent.com';

// ★ 欠席届など、既存のGoogleフォームへのボタン（保護者の画面の下に、「連絡・配布物」の隣へ並びます）。使わないなら [] のままで構いません。
//   label  : ボタンの名前（短く。3文字〜5文字くらい）
//   icon   : アイコン（'absence'=欠席届 / 'survey'=アンケート / 'notice'=お知らせ / 'link'=その他）
//   url    : フォームの「送信用URL」（https://docs.google.com/forms/d/e/.../viewform）
//   fields : 事前入力する項目の entry 番号（grade=学年, klass=クラス, student=生徒氏名, date=今日の日付）。不要な項目は省略可
var FORM_LINKS = [
  {
    label: '欠席連絡',
    icon: 'absence',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSfG2_dWVsYVLcihmdxPDDNCu7SwDowfvHIqrJVFhAbIw3z25w/viewform',
    fields: { grade: 'entry.1172457325', klass: 'entry.907591013', student: 'entry.956742059', date: 'entry.2048978737' }
  }
];

// ★ プッシュ通知を使う場合のみ設定（READMEの「プッシュ通知」参照）。使わないなら null と '' のままで構いません
var FIREBASE_CONFIG = { apiKey: 'AIzaSyD2P6DvOGLPyQmDxM1ySfj6oyv0hq1ycK4', authDomain: 'tnuss-bridge.firebaseapp.com', projectId: 'tnuss-bridge', storageBucket: 'tnuss-bridge.firebasestorage.app', messagingSenderId: '375245821863', appId: '1:375245821863:web:65dcd63564a3844df80882' };
var VAPID_KEY = 'BBEhJxQd9inZd2s58VkuJnUNK-xOjm-QQaZKr-dSXBAKu_2ErRPc4nv0qzycK6UJkLpUOmx-wzguLjBELraS-IM';

// ★ CareerPort のウェブアプリのURL（https://で始まるもの）。入れると、PCのサイドバーに「CareerPort」のリンクが出ます。空なら出ません
var CAREERPORT_URL = 'https://sites.google.com/tng.ac.jp/careerport/';

// アプリの名前と学校名（ログイン画面とPCのサイドバーに表示）
var APP_TITLE = 'TNUSS Bridge';
var APP_TAGLINE = '学校と家庭をつなぐ連絡アプリ';
var SCHOOL_NAME = '土浦日本大学中等教育学校';
