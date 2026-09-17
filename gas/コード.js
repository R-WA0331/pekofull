// ==========================================
// 1. GET処理（店舗・イベント・会員情報・クーポンの取得）
// ==========================================
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var type = e && e.parameter ? e.parameter.type : '';
  var userId = e && e.parameter ? e.parameter.userId : '';

  // ① イベントデータのリクエストの場合
  if (type === 'event') {
    var sheet = ss.getSheetByName('イベント情報'); 
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = sheet.getDataRange().getDisplayValues();
    var events = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (row[0]) {
        events.push({
          title: row[0],
          date: row[1],
          time: row[2],
          location: row[3],
          address: row[4],
          flyerUrl: row[5],
          hpUrl: row[6],
          description: row[7]
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify(events))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // ② 会員情報・保有クーポンデータのリクエストの場合
  if (type === 'getUserInfo') {
    var memberSheet = ss.getSheetByName('会員名簿');
    var userCouponSheet = ss.getSheetByName('ユーザー保有クーポン');
    var masterCouponSheet = ss.getSheetByName('クーポンマスター');
    
    var userData = null;
    var userCoupons = [];

    // 1. 会員名簿からユーザー情報を取得
    if (memberSheet) {
      var mData = memberSheet.getDataRange().getValues();
      for (var k = 1; k < mData.length; k++) {
        if (mData[k][0] === userId) {
          userData = {
            userId: mData[k][0],
            dogName: mData[k][1],
            prefecture: mData[k][2],
            birthday: mData[k][3],
            breed: mData[k][4],
            isRegular: mData[k][5]
          };
          break;
        }
      }
    }

    // 2. クーポンマスターをマッピング用オブジェクトに変換
    var masterMap = {};
    if (masterCouponSheet) {
      var masterData = masterCouponSheet.getDataRange().getValues();
      for (var m = 1; m < masterData.length; m++) {
        var cId = masterData[m][0];
        if (cId) {
          masterMap[cId] = {
            title: masterData[m][1],
            description: masterData[m][2],
            expireDays: masterData[m][3],
            targetUser: masterData[m][4],
            shopifyUrl: masterData[m][5]
          };
        }
      }
    }

  // 3. ユーザー保有クーポンから「未使用」のものを取得して結合
      if (userCouponSheet) {
        var ucData = userCouponSheet.getDataRange().getValues();
        for (var c = 1; c < ucData.length; c++) {
          var rowUserId = ucData[c][0];
          var couponId = ucData[c][1];
          var status = ucData[c][5];

          if (rowUserId === userId && status === '未使用') {
            var masterInfo = masterMap[couponId] || {};
            userCoupons.push({
              couponId: couponId,
              title: ucData[c][2] || masterInfo.title || '特別クーポン',
              description: masterInfo.description || '',
              shopifyUrl: masterInfo.shopifyUrl || '',
              targetUser: masterInfo.targetUser || '', 
              expireDate: ucData[c][4],
              status: status
            });
          }
        }
      }
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      user: userData,
      coupons: userCoupons
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // ③ 店舗データのリクエストの場合（デフォルト）
  var storeSheet = ss.getSheetByName('店舗一覧') || ss.getSheets()[0];
  var storeData = storeSheet.getDataRange().getDisplayValues();
  var stores = [];
  
  for (var j = 1; j < storeData.length; j++) {
    var sRow = storeData[j];
    if (sRow[0]) {
      stores.push({
        name: sRow[0],
        prefecture: sRow[1],
        address: sRow[2],
        tel: sRow[3],
        food: sRow[4]
      });
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify(stores))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 2. POST処理（会員判定・新規登録・ログ・消込・クーポン獲得）
// ==========================================
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var contents = JSON.parse(e.postData.contents);
    var action = contents.action;
    var userId = contents.userId;

    // ① 登録判定（checkUser）
    if (action === 'checkUser') {
      var sheet = ss.getSheetByName('会員名簿');
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ registered: false }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      var data = sheet.getDataRange().getValues();
      var isRegistered = false;
      for (var i = 1; i < data.length; i++) {
        if (data[i][0] === userId) {
          isRegistered = true;
          break;
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ registered: isRegistered }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ② 新規会員登録（registerUser）
    if (action === 'registerUser') {
      var sheet = ss.getSheetByName('会員名簿');
      if (!sheet) {
        sheet = ss.insertSheet('会員名簿');
        sheet.appendRow(['LINE_ユーザーID', '愛犬名', '都道府県', '生年月日', '犬種', '定期購入フラグ', '登録日時']);
      }

      var now = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss");
      sheet.appendRow([
        userId,
        contents.dogName,
        contents.prefecture,
        contents.birthday,
        contents.breed,
        contents.isRegular,
        now
      ]);

      // ★ 新規会員登録特典クーポンを自動付与（ID: 'NEW_MEMBER'）
      grantCoupon(ss, userId, 'NEW_MEMBER');

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ③ URL/QR経由のクーポン獲得処理（claimCoupon）
    if (action === 'claimCoupon') {
      var couponId = contents.couponId;
      if (!couponId) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No couponId provided' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      var result = grantCoupon(ss, userId, couponId);
      return ContentService.createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ④ 検索都道府県タグ保存（savePrefectureTag）
    if (action === 'savePrefectureTag') {
      var logSheet = ss.getSheetByName('ユーザー行動ログ');
      if (!logSheet) {
        logSheet = ss.insertSheet('ユーザー行動ログ');
        logSheet.appendRow(['日時', 'ユーザーID', '検索都道府県', 'アクション']);
      }
      
      var nowLog = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss");
      logSheet.appendRow([nowLog, userId, contents.prefecture, '店舗検索']);
      
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ⑤ クーポン消込処理（useCoupon）
    if (action === 'useCoupon') {
      var couponSheet = ss.getSheetByName('ユーザー保有クーポン');
      if (couponSheet) {
        var ucData = couponSheet.getDataRange().getValues();
        for (var c = 1; c < ucData.length; c++) {
          if (ucData[c][0] === userId && ucData[c][1] === contents.couponId && ucData[c][5] === '未使用') {
            var nowStr = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss");
            couponSheet.getRange(c + 1, 6).setValue('使用済み'); // F列（ステータス）を更新
            couponSheet.getRange(c + 1, 7).setValue(nowStr);   // G列（使用日時）を更新
            break;
          }
        }
      }

      // 利用履歴ログにも残す
      var historySheet = ss.getSheetByName('クーポン利用履歴');
      if (!historySheet) {
        historySheet = ss.insertSheet('クーポン利用履歴');
        historySheet.appendRow(['日時', 'ユーザーID', 'クーポンID']);
      }
      var nowCoupon = Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm:ss");
      historySheet.appendRow([nowCoupon, userId, contents.couponId]);

      return ContentService.createTextOutput(JSON.stringify({ status: 'success', success: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 3. クーポン付与共通関数
// ==========================================
function grantCoupon(ss, userId, couponId) {
  var ucSheet = ss.getSheetByName('ユーザー保有クーポン');
  var masterSheet = ss.getSheetByName('クーポンマスター');
  var memberSheet = ss.getSheetByName('会員名簿');

  if (!ucSheet) {
    ucSheet = ss.insertSheet('ユーザー保有クーポン');
    ucSheet.appendRow(['ユーザーID', 'クーポンID', 'クーポン名', '獲得日時', '有効期限', 'ステータス', '使用日時']);
  }

  // 1. クーポンマスターから情報取得
  var couponTitle = '特別クーポン';
  var expireDays = null;
  var targetUser = 'ALL';

  if (masterSheet) {
    var mData = masterSheet.getDataRange().getValues();
    for (var m = 1; m < mData.length; m++) {
      if (mData[m][0] === couponId) {
        couponTitle = mData[m][1] || couponTitle;
        expireDays = mData[m][3];
        targetUser = String(mData[m][4] || 'ALL').toUpperCase(); // E列（大文字統一）
        break;
      }
    }
  }

  // 2. 会員名簿からユーザー情報を取得（条件判定用）
  var userData = null;
  if (memberSheet) {
    var memData = memberSheet.getDataRange().getValues();
    for (var u = 1; u < memData.length; u++) {
      if (memData[u][0] === userId) {
        userData = {
          isRegular: memData[u][5], // F列: 定期購入フラグ
          birthday: memData[u][3]   // D列: 生年月日
        };
        break;
      }
    }
  }

  // 3. 対象ユーザー条件の判定
  if (targetUser === 'REGULAR') {
    if (!userData || !userData.isRegular) {
      return { status: 'error', message: 'このクーポンは定期会員様限定です' };
    }
  } else if (targetUser.indexOf('BIRTHDAY') !== -1) {
    if (!userData || !userData.birthday) {
      return { status: 'error', message: 'お誕生月が登録されていません' };
    }
    
    // 今月と愛犬の誕生月を比較
    var currentMonth = new Date().getMonth() + 1; // 1〜12月
    var birthDate = new Date(userData.birthday);
    var birthMonth = birthDate.getMonth() + 1;

    if (currentMonth !== birthMonth) {
      return { status: 'error', message: 'お誕生月限定のクーポンです' };
    }
  }

  // 4. 重複獲得チェック
  var ucData = ucSheet.getDataRange().getValues();
  for (var i = 1; i < ucData.length; i++) {
    if (ucData[i][0] === userId && ucData[i][1] === couponId) {
      return { status: 'already_exists', message: '既に保有しているクーポンです' };
    }
  }

  // 5. 有効期限の計算（空欄や0以下の場合は「無期限」）
  var now = new Date();
  var nowStr = Utilities.formatDate(now, "JST", "yyyy/MM/dd HH:mm:ss");
  var expireStr = "無期限";

  if (expireDays && !isNaN(expireDays) && Number(expireDays) > 0) {
    var expireDate = new Date(now.getTime() + (Number(expireDays) * 24 * 60 * 60 * 1000));
    expireStr = Utilities.formatDate(expireDate, "JST", "yyyy/MM/dd");
  }

  // 6. ユーザー保有クーポンシートに追加
  ucSheet.appendRow([userId, couponId, couponTitle, nowStr, expireStr, '未使用', '']);

  return { status: 'success', message: 'クーポンを獲得しました！' };
}