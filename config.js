// ★ GASで発行した「ウェブアプリのURL」（https://script.google.com/macros/s/.../exec）に置き換えてください
var GAS_URL = 'https://script.google.com/macros/s/AKfycbwjHT-0o-JckA0nr10FQ8n1eg5heRPZHs4u2WYWKBMvk9a3t7YZLcoswu1pLoGG_AKm5g/exec';

// ★ 欠席届など、既存のGoogleフォームへのボタン（保護者の画面の下に、「連絡・配布物」の隣へ並びます）。使わないなら [] のままで構いません。
//   label  : ボタンの名前（短く。3文字〜5文字くらい）
//   icon   : アイコン（'absence'=欠席届 / 'survey'=アンケート / 'notice'=お知らせ / 'link'=その他）
//   url    : フォームの「送信用URL」（https://docs.google.com/forms/d/e/.../viewform）
//   fields : 事前入力する項目の entry 番号（grade=学年, klass=クラス, student=生徒氏名, date=今日の日付）。不要な項目は省略可
var FORM_LINKS = [
  {
    label: '欠席届',
    icon: 'absence',
    url: 'https://docs.google.com/forms/d/e/1FAIpQLSfG2_dWVsYVLcihmdxPDDNCu7SwDowfvHIqrJVFhAbIw3z25w/viewform',
    fields: { grade: 'entry.1172457325', klass: 'entry.907591013', student: 'entry.956742059', date: 'entry.2048978737' }
  }
];

// ★ プッシュ通知を使う場合のみ設定（READMEの「プッシュ通知」参照）。使わないなら null と '' のままで構いません
var FIREBASE_CONFIG = { apiKey: 'AIzaSyD2P6DvOGLPyQmDxM1ySfj6oyv0hq1ycK4', authDomain: 'tnuss-bridge.firebaseapp.com', projectId: 'tnuss-bridge', storageBucket: 'tnuss-bridge.firebasestorage.app', messagingSenderId: '375245821863', appId: '1:375245821863:web:65dcd63564a3844df80882' };
var VAPID_KEY = 'BBEhJxQd9inZd2s58VkuJnUNK-xOjm-QQaZKr-dSXBAKu_2ErRPc4nv0qzycK6UJkLpUOmx-wzguLjBELraS-IM';

// アプリの名前と学校名（ログイン画面とPCのサイドバーに表示）
var APP_TITLE = 'TNUSS Bridge';
var APP_TAGLINE = '学校と家庭をつなぐ連絡アプリ';
var SCHOOL_NAME = '土浦日本大学中等教育学校';
