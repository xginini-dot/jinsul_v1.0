# 공통 의원 수가표 자동 갱신

기존 `ysarang-combination.html` 주소를 유지합니다. 메인 포털과 다른 통계 페이지는 그대로 배포합니다.

## 관리자 설정 (처음 한 번)

1. 저장소 Settings → Secrets and variables → Actions → New repository secret.
2. 이름은 `HIRA_API_KEY`, 값에는 공공데이터포털의 일반 인증키를 입력합니다. 키는 소스 파일에 넣지 않습니다.
3. Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 설정합니다.
4. Actions → **Update clinic fees and publish** → Run workflow를 실행합니다.
5. 실행 완료 후 https://xginini-dot.github.io/jinsul_v1.0/ysarang-combination.html 에서 공통 의원단가 표시를 확인합니다.

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
