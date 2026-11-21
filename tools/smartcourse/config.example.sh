#!/bin/bash
# 智慧课程参数模板
# 用法：
#   cp config.example.sh config.sh
#   然后从浏览器地址栏复制一次 URL，把参数填进来
#
# 地址栏形如：
#   https://smartcourse.hust.edu.cn/mooc-smartcourse/mycourse/studentstudy
#     ?chapterId=582278&courseId=111&clazzid=222&cpi=333&enc=abc&mooc2=1
#     &hidetype=0&openc=def

export SC_COURSE_ID="<COURSE_ID>"
export SC_CLAZZ_ID="<CLAzzID>"
export SC_CPI="<CPI>"
export SC_ENC="<ENC>"
export SC_OPENC="<OPENC>"

# bsk 会话与目标标签页
export SC_SESSION="<session_id>"
export SC_TAB_ID="<tab_id>"

# 脚本所在目录（日志、临时文件都放这里）
export SC_WORKDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 拼章节 URL
sc_url() {
  local cid="$1"
  printf 'https://smartcourse.hust.edu.cn/mooc-smartcourse/mycourse/studentstudy?chapterId=%s&courseId=%s&clazzid=%s&cpi=%s&enc=%s&mooc2=1&hidetype=0&openc=%s' \
    "$cid" "$SC_COURSE_ID" "$SC_CLAZZ_ID" "$SC_CPI" "$SC_ENC" "$SC_OPENC"
}
