# 공통 의원 수가표 자동 갱신

기존 `ysarang-combination.html` 주소를 유지합니다. 메인 포털과 다른 통계 페이지는 그대로 배포합니다.

## 관리자 설정 (처음 한 번)

1. 저장소 Settings → Secrets and variables → Actions → New repository secret.
2. 이름은 `HIRA_API_KEY`, 값에는 공공데이터포털의 일반 인증키를 입력합니다. 키는 소스 파일에 넣지 않습니다.
3. Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 설정합니다.
4. Actions → **Update clinic fees and publish** → Run workflow를 실행합니다.
5. 실행 완료 후 https://xginini-dot.github.io/jinsul_v1.0/ysarang-combination.html 에서 공통 의원단가 표시를 확인합니다.

## GitHub와 Cloudflare 동시 반영

Cloudflare의 `jinsul-portal` 프로젝트는 같은 GitHub 저장소의 `main` 브랜치를 연결해 둡니다. 통계 HTML이나 `hira-prices.json`이 `main`에 커밋되면 GitHub Pages와 Cloudflare가 각각 새 배포를 만듭니다. GitHub Pages의 배포 파일이 Cloudflare로 전달되는 방식이 아니라, 두 서비스가 같은 GitHub 커밋을 각각 배포하는 구조입니다.

Cloudflare Access로 사이트를 보호하는 경우, 페이지가 같은 주소의 JSON 파일을 읽을 때 로그인 세션을 포함해야 합니다. `hira-prices.json` 요청의 `credentials` 값은 `same-origin`을 유지합니다. `omit`으로 바꾸면 HTML은 열리더라도 가격 파일만 Cloudflare 로그인 화면으로 이동하여 공통 단가 연결 실패가 발생합니다. 이 동작은 `hira_shared.test.cjs`에서 자동 검사합니다.

새 통계를 추가할 때는 다음 순서로 확인합니다.

1. HTML과 필요한 공개 데이터 파일을 GitHub 저장소 `main`에 커밋합니다.
2. GitHub Actions의 **Update clinic fees and publish** 실행이 성공했는지 확인합니다.
3. Cloudflare → Workers & Pages → `jinsul-portal` → Deployments에서 같은 커밋의 배포 성공 여부를 확인합니다.
4. GitHub Pages와 Cloudflare 주소를 각각 새로고침해 화면과 마지막 정상 조회일을 확인합니다.

Cloudflare에 반영되지 않았을 때는 Deployments의 최신 커밋명이 GitHub의 최신 커밋명과 같은지 먼저 확인합니다. 다르면 GitHub 연결 저장소·Production branch(`main`)·자동 배포 상태를 확인하고 최신 배포를 다시 실행합니다. 커밋은 같지만 화면이 이전 버전이면 강력 새로고침 후 다시 확인합니다.

### 수동 갱신

1. GitHub → Actions → **Update clinic fees and publish**로 이동합니다.
2. **Run workflow**를 누르고 `main`에서 실행합니다.
3. 초록색 성공 표시와 새 `Update official clinic fee table` 커밋을 확인합니다.
4. Cloudflare Deployments에서 같은 커밋이 배포될 때까지 기다린 뒤 사이트를 새로고침합니다.
5. 기존 브라우저의 수동 단가가 유지되면 화면 아래에서 **개인 수정 해제 · 공통 단가 사용**을 한 번 누릅니다.

이후 매일 한국시간 06:17에 조회를 예약합니다. GitHub 사정에 따라 시작 시간이 늦어질 수 있습니다. 공개 저장소의 예약 작업은 장기간 저장소 활동이 없으면 비활성화될 수 있으므로 Actions 상태와 화면의 마지막 정상 조회일을 확인하세요.

## 갱신 규칙

- 등록된 LA 28종·부가처방 8종의 기본 코드와 정확히 일치하는 의원단가(`unprc1`)만 사용합니다.
- 36종 모두 정상 검증된 경우에만 `hira-prices.json`을 교체합니다. 일부 실패 시 작업이 실패 상태가 되고, 기존 배포와 마지막 정상 수가표는 유지됩니다.
- 같은 작업 안에서 사이트 배포까지 수행합니다. 봇이 커밋한 뒤 별도 push 워크플로가 실행되기를 기대하지 않습니다.
- 업데이트 작업만 `HIRA_API_KEY`를 사용합니다. 사이트 배포 묶음에는 HTML, 공개 수가표, 엑셀 처리 라이브러리와 로고만 들어갑니다.
- 출처: https://www.data.go.kr/data/15021028/openapi.do (건강보험심사평가원 수가기준정보조회서비스).

## 사용자별 단가

- 사이트를 열면 공통 수가표가 자동 적용됩니다. 별도의 키 입력은 필요 없습니다.
- 사용자가 바꿔 저장한 단가는 해당 브라우저에서만 유지되고 이후 공통 수가표 갱신으로 덮어쓰지 않습니다.
- ‘개인 수정 해제 · 공통 단가 사용’을 누르면 개인 수정값을 해제합니다.
- 연결 실패 시 저장된 수가표를 사용하며 마지막 정상 조회일을 표시합니다.
- 진료일별 과거 수가, 야간·연령·횟수 가산/감산을 자동 계산하는 청구 프로그램은 아닙니다. 공통 기본 단가가 조회 기간 전체에 적용됩니다.
- 환자 엑셀은 브라우저 안에서 처리되며 GitHub와 심평원에 전송되지 않습니다.

## 검증

`python -m unittest test_hira_update.py`

`node --test hira_shared.test.cjs`

`python hira_build.py`

배포 결과는 `site/`에 생성됩니다. 이 폴더는 Git에 커밋하지 않습니다.
