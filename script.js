const GOOGLE_MAP_LIST_URL = "https://maps.app.goo.gl/QhudeDFhPFJAtMUc8?g_st=i";
const ONLINE_SHOP_URL = "https://www.pekofull.com";

const PREFECTURES = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

let lineUserId = "";
let fetchedStores = [];
let fetchedEvents = [];

// 開発・ローカルテスト用
if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
  lineUserId = 'U885733473bf657b4bfe0260d01ae9f17';
}

document.addEventListener("DOMContentLoaded", function () {
    initPrefectureOptions();
    loadStoresFromSheet();
    loadEventsFromSheet();
});

/**
 * index.html から MY_LIFF_ID のセット完了後に呼び出される初期化関数
 */
function initLiffApp() {
    if (!window.MY_LIFF_ID) {
        console.error("MY_LIFF_ID が設定されていません");
        navigateTo('menuPage');
        return;
    }

    liff.init({ liffId: window.MY_LIFF_ID }).then(async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const targetPageParam = urlParams.get('page');

        const pageMap = {
            'calc': 'calcPage',
            'guide': 'guidePage',
            'store': 'storePage',
            'faq': 'faqPage',
            'event': 'eventPage',
            'member': 'memberPage',
            'coupon': 'memberPage'
        };

        const directTarget = pageMap[targetPageParam] || targetPageParam;

        if (liff.isLoggedIn()) {
            try {
                const profile = await liff.getProfile();
                lineUserId = profile.userId;

                await handleUrlCouponClaim(lineUserId);

                if (directTarget && document.getElementById(directTarget)) {
                    navigateTo(directTarget);
                } else {
                    checkUserRegistration(lineUserId);
                }
            } catch (err) {
                console.error("Profile fetch error:", err);
                navigateTo('menuPage');
            }
        } else {
            if (directTarget && document.getElementById(directTarget)) {
                navigateTo(directTarget);
            } else {
                navigateTo('menuPage');
            }
        }
    }).catch(err => {
        console.error("LIFF Init Error:", err);
        navigateTo('menuPage');
    });
}

/**
 * URLパラメータから claimCoupon を抽出してGASを呼び出す処理
 */
async function handleUrlCouponClaim(userId) {
    const urlParams = new URLSearchParams(window.location.search);
    const couponId = urlParams.get('claimCoupon');

    if (!couponId || !window.GAS_API_URL || window.GAS_API_URL.includes("YOUR_GAS_DEPLOYMENT_ID")) return;

    try {
        const response = await fetch(window.GAS_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'claimCoupon',
                userId: userId,
                couponId: couponId
            })
        });

        const res = await response.json();

        if (res.status === 'success') {
            alert(`🎉 ${res.message}`);
        } else if (res.status === 'already_exists') {
            console.log('すでに保有済みのクーポンです。');
        } else if (res.status === 'error') {
            alert(`⚠️ ${res.message}`);
        }
    } catch (err) {
        console.error('Coupon claim request failed:', err);
    } finally {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('claimCoupon');
        window.history.replaceState({}, document.title, cleanUrl.toString());
    }
}

function initPrefectureOptions() {
    const selects = document.querySelectorAll('.pref-select-target');
    selects.forEach(select => {
        PREFECTURES.forEach(pref => {
            const option = document.createElement('option');
            option.value = pref;
            option.textContent = pref;
            select.appendChild(option);
        });
    });
}

function checkUserRegistration(userId) {
  if (!window.GAS_API_URL || window.GAS_API_URL.includes("YOUR_GAS_DEPLOY_ID")) {
    navigateTo('menuPage');
    return;
  }

  fetch(window.GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'checkUser', userId: userId })
  })
  .then(res => res.json())
  .then(data => {
    if (data && data.registered) {
      navigateTo('menuPage');
    } else {
      navigateTo('registerPage');
    }
  })
  .catch(err => {
    console.warn("GAS通信エラー（未登録扱いとして登録画面を表示）:", err);
    navigateTo('registerPage');
  });
}

// GASから会員情報と保有クーポンを取得して画面に描画する関数
async function loadMemberData() {
  const couponListEl = document.getElementById('couponList');
  if (!window.GAS_API_URL || window.GAS_API_URL.includes("YOUR_GAS_DEPLOYMENT_ID")) return;

  const targetUserId = lineUserId || 'GUEST';

  try {
    const response = await fetch(`${window.GAS_API_URL}${window.GAS_API_URL.includes('?') ? '&' : '?'}type=getUserInfo&userId=${targetUserId}`);
    const data = await response.json();

    if (data.status === 'success' || data.user) {
      if (data.user) {
        document.getElementById('memberDogName').innerText = (data.user.dogName || '----') + ' ちゃん';
        document.getElementById('memberBreed').innerText = data.user.breed || '-';
        document.getElementById('memberPrefectures').innerText = data.user.prefecture || '-';
        document.getElementById('memberUserId').innerText = 'ID: ' + (data.user.userId || targetUserId);
      }

      if (data.coupons && data.coupons.length > 0) {
        const usedSet = new Set(data.usedCoupons || []);
        
        couponListEl.innerHTML = data.coupons.map(coupon => {
          const isUsed = usedSet.has(coupon.couponId);
          
          const rawTarget = coupon.targetUser || coupon.target || '';
          const targetUserStr = String(rawTarget).toUpperCase();
          const showEventBtn = targetUserStr.includes('EVENT');

          const hasShopifyUrl = coupon.shopifyUrl && String(coupon.shopifyUrl).trim() !== '';

          let buttonsHtml = '';

          if (showEventBtn) {
            buttonsHtml += `
              <button class="btn-main" id="btn-coupon-${coupon.couponId}" 
                      onclick="useEventCoupon('${coupon.couponId}')" 
                      style="background:var(--meal-accent); flex:1; font-size:11px; padding:8px 4px;" 
                      ${isUsed ? 'disabled' : ''}>
                <i class="fa-solid fa-qrcode"></i> ${isUsed ? '使用済み' : 'イベントで使う'}
              </button>
            `;
          }

          if (hasShopifyUrl) {
            buttonsHtml += `
              <a href="${coupon.shopifyUrl}" target="_blank" rel="noopener noreferrer" 
                 class="btn-main" 
                 style="background:#3182ce; color:#fff; flex:1; font-size:11px; padding:8px 4px; text-decoration:none; display:inline-flex; align-items:center; justify-content:center;">
                <i class="fa-solid fa-arrow-up-right-from-square" style="margin-right:4px;"></i> 購入サイトを見る
              </a>
            `;
          }

          return `
            <div class="coupon-card ${isUsed ? 'used' : ''}" id="coupon-${coupon.couponId}">
              <div class="coupon-badge" style="background:${isUsed ? '#a0aec0' : '#38a169'};">
                ${isUsed ? '使用済み' : '未使用'}
              </div>
              <div class="coupon-title">${coupon.title}</div>
              <div class="coupon-desc">${coupon.description}</div>
              
              <div style="display:flex; gap:8px; margin-top:10px;">
                ${buttonsHtml}
              </div>
            </div>
          `;
        }).join('');

      } else {
        couponListEl.innerHTML = `<p style="text-align:center; font-size:12px; color:#718096; padding:16px;">利用可能なクーポンはありません。</p>`;
      }
    }
  } catch (error) {
    console.error('データ取得失敗:', error);
    if (couponListEl) {
      couponListEl.innerHTML = `<p style="text-align:center; font-size:12px; color:#e53e3e; padding:16px;">クーポンの読み込みに失敗しました。</p>`;
    }
  }
}

function applyShopifyCoupon(code) {
    const shopifyUrl = `${ONLINE_SHOP_URL}/discount/${code}`;
    window.open(shopifyUrl, '_blank');
}

function useEventCoupon(couponId) {
    if (!confirm("スタッフの前で「OK」を押してください。消込を完了しますか？")) return;

    const btn = document.getElementById(`btn-coupon-${couponId}`);
    if (btn) btn.disabled = true;

    fetch(window.GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify({
            action: 'useCoupon',
            userId: lineUserId,
            couponId: couponId
        })
    })
    .then(res => res.json())
    .then(data => {
        alert("クーポンを使用しました！");
        loadMemberData();
    })
    .catch(err => {
        alert("処理に失敗しました。");
        if (btn) btn.disabled = false;
    });
}

function navigateTo(pageId) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        window.scrollTo(0, 0);
    }

    if (pageId === 'eventPage' && fetchedEvents.length === 0) {
        loadEventsFromSheet();
    }

    if (pageId === 'memberPage') {
        loadMemberData();
    }
}

function toggleOtherBreedInput(selectElement) {
    const otherGroup = document.getElementById('otherBreedGroup');
    const otherInput = document.getElementById('regBreedOther');
    
    if (selectElement.value === 'その他') {
        otherGroup.style.display = 'block';
        otherInput.required = true;
    } else {
        otherGroup.style.display = 'none';
        otherInput.required = false;
        otherInput.value = '';
    }
}

function toggleFaq(element) {
    const currentAnswer = element.nextElementSibling;
    const currentIcon = element.querySelector('i');
    const isOpen = currentAnswer.style.display === 'block';

    document.querySelectorAll('.faq-a').forEach(answer => {
        answer.style.display = 'none';
    });
    document.querySelectorAll('.faq-q i').forEach(icon => {
        if (icon) icon.className = 'fa-solid fa-chevron-down';
    });

    if (!isOpen) {
        currentAnswer.style.display = 'block';
        if (currentIcon) currentIcon.className = 'fa-solid fa-chevron-up';
    }
}

function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('regSubmitBtn');
    btn.innerText = "登録中...";
    btn.disabled = true;

    let selectedBreed = document.getElementById('regBreed').value;
    if (selectedBreed === 'その他') {
        selectedBreed = document.getElementById('regBreedOther').value.trim();
    }

    const payload = {
        action: 'registerUser',
        userId: lineUserId,
        dogName: document.getElementById('regDogName').value,
        prefecture: document.getElementById('regPrefecture').value,
        birthday: document.getElementById('regBirthday').value,
        breed: selectedBreed,
        isRegular: document.querySelector('input[name="isRegular"]:checked').value === "true"
    };

    fetch(window.GAS_API_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        alert("登録が完了しました！");
        navigateTo('menuPage');
    })
    .catch(err => {
        console.warn("登録完了フォールバック:", err);
        navigateTo('menuPage');
    })
    .finally(() => {
        btn.innerText = "登録してはじめる";
        btn.disabled = false;
    });
}

function loadStoresFromSheet() {
    if (!window.GAS_API_URL || window.GAS_API_URL.includes("YOUR_GAS_DEPLOYMENT_ID")) return;
    fetch(window.GAS_API_URL)
    .then(res => res.json())
    .then(data => { fetchedStores = data; })
    .catch(err => console.error(err));
}

function loadEventsFromSheet() {
    if (!window.GAS_API_URL || window.GAS_API_URL.includes("YOUR_GAS_DEPLOYMENT_ID")) return;
    const eventUrl = window.GAS_API_URL + (window.GAS_API_URL.includes('?') ? '&type=event' : '?type=event');

    fetch(eventUrl)
    .then(res => res.json())
    .then(data => {
        fetchedEvents = data;
        renderEvents();
    })
    .catch(err => {
        const loadingDiv = document.getElementById('eventLoading');
        if (loadingDiv) loadingDiv.innerText = "イベント情報の取得に失敗しました。";
    });
}

function fixImageUrl(url) {
    if (!url) return "";
    if (url.includes("drive.google.com")) {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return `https://lh3.googleusercontent.com/d/${match[1]}`;
        }
    }
    return url;
}

function getEventDateBadges(dateStr) {
    if (!dateStr) return { dateText: "", statusBadgeHtml: "" };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const match = dateStr.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!match) {
        return { dateText: dateStr, statusBadgeHtml: "" };
    }

    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const eventDate = new Date(year, month, day);

    const monthFormatted = String(month + 1).padStart(2, '0');
    const dayFormatted = String(day).padStart(2, '0');
    let formattedDateText = `${monthFormatted}/${dayFormatted}`;
    if (dateStr.includes('~')) {
        const rangeMatch = dateStr.match(/~(\d{1,2})/);
        if (rangeMatch) formattedDateText += `〜${rangeMatch[1]}`;
    }

    const isToday = eventDate.getTime() === today.getTime();

    const dayOfWeek = today.getDay();
    const diffToSat = (6 - dayOfWeek + 7) % 7;
    const thisSat = new Date(today);
    thisSat.setDate(today.getDate() + diffToSat);
    const thisSun = new Date(thisSat);
    thisSun.setDate(thisSat.getDate() + 1);

    const isThisWeekend = (eventDate >= thisSat && eventDate <= thisSun);

    let statusBadgeHtml = "";
    if (isToday) {
        statusBadgeHtml = `<span class="event-status-tag status-today">本日開催</span>`;
    } else if (isThisWeekend) {
        statusBadgeHtml = `<span class="event-status-tag status-weekend">今週末開催</span>`;
    }

    return { dateText: formattedDateText, statusBadgeHtml: statusBadgeHtml };
}

function renderEvents() {
    const loadingDiv = document.getElementById('eventLoading');
    const listDiv = document.getElementById('eventResultList');
    if (!loadingDiv || !listDiv) return;

    loadingDiv.style.display = 'none';
    listDiv.innerHTML = "";

    if (!fetchedEvents || fetchedEvents.length === 0) {
        listDiv.innerHTML = `
            <div style="background:#fff; border:1px solid var(--border-color); border-radius:var(--radius-md); padding:20px; text-align:center;">
                <div style="font-size:12px; font-weight:bold; color:var(--text-muted);">現在予定されているイベントはありません</div>
            </div>
        `;
        return;
    }

    let cardsHtml = "";
    fetchedEvents.forEach(item => {
        const flyerImage = fixImageUrl(item.flyerUrl);
        const flyerHtml = flyerImage ? `<img src="${flyerImage}" class="event-flyer" alt="イベントチラシ">` : '';
        const descHtml = item.description ? `<div class="event-desc">${item.description}</div>` : '';

        const { dateText, statusBadgeHtml } = getEventDateBadges(item.date);
        const timeText = item.time ? `<span class="event-time-text"><i class="fa-regular fa-clock"></i> ${item.time}</span>` : '';

        const mapSearchQuery = encodeURIComponent((item.location || '') + ' ' + (item.address || ''));
        const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;

        const mapBtnHtml = (item.location || item.address)
            ? `<a href="${mapSearchUrl}" target="_blank" class="map-btn" style="background:#4285F4;"><i class="fa-solid fa-map-location-dot"></i> ルート案内</a>`
            : '';
        const hpHtml = item.hpUrl
            ? `<a href="${item.hpUrl}" target="_blank" class="map-btn" style="background:var(--brand-blue);"><i class="fa-solid fa-arrow-up-right-from-square"></i> 詳細ページ</a>`
            : '';

        cardsHtml += `
            <div class="event-card">
                <div class="event-card-header">
                    <div class="event-date-large">
                        <i class="fa-regular fa-calendar-days"></i> ${dateText}
                    </div>
                    ${statusBadgeHtml}
                </div>

                <div class="event-title">${item.title || '無題のイベント'}</div>

                <div class="event-location-badge">
                    <i class="fa-solid fa-location-dot"></i> <b>${item.location || '開催場所未定'}</b>
                </div>

                ${item.address ? `<div class="event-info-row"><i class="fa-solid fa-house"></i> ${item.address}</div>` : ''}
                ${timeText ? `<div class="event-info-row">${timeText}</div>` : ''}

                ${flyerHtml}
                ${descHtml}

                <div class="event-btn-group">
                    ${mapBtnHtml}
                    ${hpHtml}
                </div>
            </div>
        `;
    });

    listDiv.innerHTML = cardsHtml;
}

function calculate() {
    const weight = parseFloat(document.getElementById('weight').value);
    const times = parseInt(document.getElementById('times').value);

    if (!weight || weight <= 0 || weight > 60) {
        alert('0.1kg 〜 60kg の範囲で入力してください。');
        return;
    }

    const kcal = 130 * Math.pow(weight, 0.75);
    const dayGram = Math.round(kcal / 1.946);
    const mealGram = Math.round(dayGram / times);
    const days = (400 / dayGram).toFixed(1);

    const dayCm = (28 * (dayGram / 400)).toFixed(1);
    const mealCm = (28 * (mealGram / 400)).toFixed(1);

    document.getElementById('sumWeight').innerText = weight;
    document.getElementById('sumTimes').innerText = times;

    document.getElementById('mealGram').innerText = mealGram;
    document.getElementById('dayGram').innerText = dayGram;
    document.getElementById('kcal').innerText = Math.round(kcal);
    document.getElementById('days').innerText = days;

    document.getElementById('mealCm').innerText = mealCm;
    document.getElementById('mealGramGuide').innerText = mealGram;
    document.getElementById('dayCm').innerText = dayCm;
    document.getElementById('dayGramGuide').innerText = dayGram;

    let dayPercent = (dayGram / 400) * 100;
    let mealPercent = (mealGram / 400) * 100;
    if (dayPercent > 100) dayPercent = 100;
    if (mealPercent > dayPercent) mealPercent = dayPercent;

    document.getElementById('rollMealPortion').style.width = mealPercent.toFixed(1) + '%';
    document.getElementById('rollDayPortion').style.width = (dayPercent - mealPercent).toFixed(1) + '%';

    document.getElementById('inputSection').style.display = 'none';
    document.getElementById('conditionsSummary').style.display = 'flex';
    document.getElementById('result').style.display = 'block';
}

function resetForm() {
    document.getElementById('inputSection').style.display = 'block';
    document.getElementById('conditionsSummary').style.display = 'none';
    document.getElementById('result').style.display = 'none';
}

function sendToLineTalk() {
    if (!liff.isLoggedIn()) return alert("LINEでログインされていません。");

    const messageText = `【ぺこふる】給餌量カット計算結果\n--------------------\n` +
    `■ 体重: ${document.getElementById('sumWeight').innerText} kg / 1日 ${document.getElementById('sumTimes').innerText} 回\n` +
    `1食分: 約 ${document.getElementById('mealGram').innerText} g (約 ${document.getElementById('mealCm').innerText} cm)\n` +
    `1日分: 約 ${document.getElementById('dayGram').innerText} g (約 ${document.getElementById('dayCm').innerText} cm)\n` +
    `1本持ち: 約 ${document.getElementById('days').innerText} 日分`;

    if (liff.isInClient()) {
        liff.sendMessages([{ type: 'text', text: messageText }])
            .then(() => { alert('トークに送信しました！'); liff.closeWindow(); })
            .catch(err => alert('送信失敗: ' + err.message));
    }
}

async function searchStore() {
    const selectedPref = document.getElementById('prefSelect').value;
    if (!selectedPref) return alert('都道府県を選択してください。');

    if (window.GAS_API_URL && !window.GAS_API_URL.includes("YOUR_GAS_DEPLOYMENT_ID")) {
        fetch(window.GAS_API_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'savePrefectureTag',
                userId: lineUserId || 'GUEST',
                prefecture: selectedPref
            })
        }).catch(err => console.error("GAS Action log save error:", err));
    }

    const resultDiv = document.getElementById('storeResult');
    const loadingDiv = document.getElementById('loadingMsg');
    
    if (fetchedStores.length === 0 && window.GAS_API_URL && !window.GAS_API_URL.includes("YOUR_GAS_DEPLOYMENT_ID")) {
        loadingDiv.style.display = 'block';
        try {
            const res = await fetch(window.GAS_API_URL);
            fetchedStores = await res.json();
        } catch (e) {
            console.error("再取得エラー", e);
        }
        loadingDiv.style.display = 'none';
    }

    resultDiv.innerHTML = "";

    const stores = fetchedStores.filter(s => s.prefecture && s.prefecture.trim() === selectedPref.trim());

    let mapListHtml = `
    <div style="background:#ebf8ff; border:1px solid #bee3f8; border-radius:var(--radius-md); padding:12px; margin-bottom:12px; text-align:center;">
        <div style="font-size:12px; font-weight:bold; color:var(--brand-blue); margin-bottom:4px;">全国の取扱店舗マップ（Googleマップ）</div>
        <div style="font-size:10px; color:var(--text-muted); margin-bottom:8px;">現在地から最も近い店舗をGoogleマップで確認できます</div>
        <a href="${GOOGLE_MAP_LIST_URL}" target="_blank" class="map-btn" style="background:#38a169; display:block; width:100%;">
        <i class="fa-solid fa-map-location-dot"></i> マップで近くの店舗を探す
        </a>
    </div>
    `;

    if (stores.length > 0) {
        let storeCardsHtml = "";

        stores.forEach(store => {
            const nameText = (store.name || '').trim();
            const addressText = (store.address || '').trim();
            const telText = store.tel ? String(store.tel) : '';
            
            const mapSearchQuery = encodeURIComponent(nameText + " " + addressText);
            const mapSearchUrl = `https://www.google.com/maps/search/?api=1&query=${mapSearchQuery}`;

            const telBtnHtml = telText 
            ? `<a href="tel:${telText.replace(/[^0-9]/g, '')}" class="map-btn" style="background:#dd6b20;"><i class="fa-solid fa-phone"></i> 在庫確認</a>` 
            : '';

            const foodTagHtml = store.food 
            ? `<div class="food-tag"><i class="fa-solid fa-bone"></i> 取扱い: ${store.food}</div>` 
            : '';

            storeCardsHtml += `
            <div class="store-card">
                <div class="store-name"><i class="fa-solid fa-store"></i> ${nameText}</div>
                ${foodTagHtml}
                ${addressText ? `<div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">${addressText}</div>` : ''}
                ${telText ? `<div style="font-size:11px; color:var(--text-muted); margin-bottom:8px;">TEL: ${telText}</div>` : ''}
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <a href="${mapSearchUrl}" target="_blank" class="map-btn"><i class="fa-solid fa-route"></i> ルート案内</a>
                ${telBtnHtml}
                </div>
            </div>
            `;
        });

        const shopFooterHtml = `
            <div style="margin-top:14px; padding:12px; background:#fffaf0; border:1px solid #feebc8; border-radius:var(--radius-md); text-align:center;">
            <div style="font-size:11px; color:var(--text-main); margin-bottom:8px;">遠方の場合は公式オンラインショップもご利用いただけます。</div>
            <a href="${ONLINE_SHOP_URL}" target="_blank" class="map-btn" style="background:var(--board-navy); display:block;">
                <i class="fa-solid fa-cart-shopping"></i> 公式オンラインショップを見る
            </a>
            </div>
        `;

        resultDiv.innerHTML = mapListHtml + storeCardsHtml + shopFooterHtml;

    } else {
        resultDiv.innerHTML = mapListHtml + `
            <div style="background:#fff; border:1px solid var(--border-color); border-radius:var(--radius-md); padding:16px; text-align:center; margin-top:12px;">
            <div style="font-size:12px; font-weight:bold; color:var(--text-main); margin-bottom:8px;">「${selectedPref}」には現在お取り扱い店舗がございません</div>
            <a href="${ONLINE_SHOP_URL}" target="_blank" class="map-btn" style="background:var(--board-navy); display:block; width:100%;">
                <i class="fa-solid fa-cart-shopping"></i> 公式オンラインショップで購入する
            </a>
            </div>
        `;
    }

    resultDiv.style.display = 'block';
}

function toggleAccordion(element) {
  var content = element.nextElementSibling;
  var icon = element.querySelector('.fa-chevron-down, .fa-chevron-up');

  if (content.style.display === "block") {
    content.style.display = "none";
    if (icon) {
      icon.classList.remove('fa-chevron-up');
      icon.classList.add('fa-chevron-down');
    }
  } else {
    content.style.display = "block";
    if (icon) {
      icon.classList.remove('fa-chevron-down');
      icon.classList.add('fa-chevron-up');
    }
  }
}