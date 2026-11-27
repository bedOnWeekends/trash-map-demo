/// <reference types="kakao.maps.d.ts" />
let pending: Promise<void> | undefined;
export function loadKakao() {
  if (typeof window === "undefined")
    return Promise.reject(Error("지도는 브라우저에서 열 수 있습니다."));
  const key = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  if (!key)
    return Promise.reject(
      Error("카카오 지도 키가 없어 가상 배치도를 표시합니다."),
    );
  if (pending) return pending;
  pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const finish = (err?: string) => {
      clearTimeout(timeout);
      script.onerror = null;
      script.onload = null;
      if (err) {
        script.remove();
        reject(Error(err));
      } else resolve();
    };
    const timeout = setTimeout(
      () => finish("카카오 지도 연결 시간이 초과되었습니다."),
      9000,
    );
    script.async = true;
    script.src =
      "https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&appkey=" +
      encodeURIComponent(key);
    script.onload = () => {
      if (typeof kakao === "undefined" || !kakao.maps)
        finish("카카오 지도 도메인 설정을 확인해 주세요.");
      else kakao.maps.load(() => finish());
    };
    script.onerror = () =>
      finish("카카오 지도에 연결할 수 없어 가상 배치도를 표시합니다.");
    document.head.appendChild(script);
  }).catch((e) => {
    pending = undefined;
    throw e;
  });
  return pending;
}
