/**
 * @typedef {Object} Item
 * @property {String} infodatepx - 内容时间
 * @property {String} infoid - 内容ID
 * @property {String} categorynum - 类型编号
 * @property {String} areaname - 地区
 * @property {String} title - 标题
 * @property {String} linkurl - 内容地址，示例：/jyxx/001001/001001002/001001002005/20240104/ad57b363-c612-4eea-a8ed-d99e0269fb02.html
 */

/**
 * @typedef {Object} DataLine
 * @property {String} status - 抓取状态，Y=成功
 * @property {String} id - 消息ID
 * @property {String} date - 消息日期
 * @property {String} xmlx - 项目类型
 * @property {String} dq - 地区/城市
 * @property {String} xmmc - 项目名称
 * @property {String} xmbh - 项目编号
 * @property {String} fbrq - 公告发布日期
 * @property {String} zbr - 中标人
 * @property {String} zbj - 中标价
 * @property {String} gq - 工期
 * @property {String} xmjl - 项目经理
 * @property {String} jgbm - 监管部门
 * @property {String} url - 真实内容的完整地址
 */

/**
 * 爬取内容
 * @param {String|Number} codeId
 * @param {Number} pageSize - 单次抓取数量上限
 * @param {Boolean} skipFail - 跳过流标
 */
const fetchDo = (codeId, pageSize=5000, skipFail=true)=>{
    const codeNames = {
        "001001001005": "房建市政",
        "001001002005": "水利工程",
        "001001003005": "交通工程",
        "001001004005": "铁路工程",
        "001001005005": "其他工程"
    }
    const columns = {
        xmmc:"项目名称",
        xmbh:"(项目|招标|标段)编号",
        fbrq:"发布日期",
        zbr:"中标(人|单位)(?!公示)",
        zbj:"中标(价|费率|金额)|报价",
        gq:"交货期|期限|工期",
        xmjl:"项目(经理|总?负责)|联系人",
        jgbm:"(监督|受理)部门"
    }

    let code = ``
    codeId+=""
    if(codeId.length == 1)  code = `00100100${codeId}005`
    if(codeId.length == 3)  code = `001001${codeId}005`
    if(codeId.length == 9)  code = `${codeId}005`
    if(codeId.length == 12) code = codeId

    let body = {
        "pn": 0,
        "rn": pageSize,
        "fields": "title",
        "cnum": "001",
        "sort": "{\"infodatepx\":\"0\"}",
        "ssort": "title",
        "cl": 200,
        "condition": [ { "fieldName": "categorynum", "equal": code, "notEqual": null, "equalList": null, "notEqualList": null, "isLike": true, "likeType": 2 }],
        "isBusiness": "1"
    }

    let items = [["STATUS", "项目类型","地区/城市", "名称","编号","发布日期","中标人","中标价/费率","工期","项目经理","监管部门", "信息日期", "链接"]]

    /**@param {String} text */
    const _clean = text=> text.replace(/[\t\r\f\n\s]*/g, "")
    /**
     * 检测元素内容是否符合特定的表达式
     * @param {Element} ele
     * @param {String} regex
     * @returns {Boolean}
     */
    const _test = (ele, regex) => RegExp(regex).test(_clean(ele.textContent))


    fetch(
        "http://ggzy.jgswj.gxzf.gov.cn/inteligentsearchgxes/rest/esinteligentsearch/getFullTextDataNew", {
        "body": JSON.stringify(body),
        "method": "POST"
    }).then(v=>v.json()).then(async response=>{
        let { totalcount, records } = response.result
        console.debug(`类型=${code}（${codeNames[code]}） 共有 ${totalcount} 条数据，本次获取 ${records.length} 条`)

        for(let i=0;i<records.length;i++){
            /**@type {Item} */
            const record = records[i]
            if(skipFail && !/中标(结果)?公[示|告]$/.test(record.title)){
                console.debug(`${i+1}/${records.length}`, record.title, "跳过...")
                continue
            }

            /**@type {DataLine} */
            const d = {
                xmlx: codeNames[code], dq: record.areaname, id: record.infoid, date: record.infodatepx, status:"Y",
                url: "http://ggzy.jgswj.gxzf.gov.cn/gxggzy"+record.linkurl
            }



            //获取内容
            let html = await fetch(d.url).then(v=>v.text())
            let document = new DOMParser().parseFromString(html, "text/html")

            let contentDiv =  document.querySelector(".ewb-details-info")
            /**@type {Array<String>} 多个中标人情况 */
            let extraLines = []

            if(!!contentDiv){
                /**@type {Array<String>} */
                let lines = []
                /**
                 * @param {String} text
                 * @returns {Array<String>}
                 */
                const _split = text=> text.trim().split("\n").map(v=>v.trim())
                /**@param {Element} ele */
                const _allText = ele => {
                    _split(ele.textContent).forEach(text=>{
                        if(text.length>3)   lines.push(text)
                    })
                }
                /**
                 * 将两个单元格的内容组合为一行
                 * @param {Element} td1
                 * @param {Element} td2
                 */
                const _addLine = (td1, td2)=>{
                    if(!td1 || !td2)    return

                    let type = _clean(td1.textContent)
                    let line = `${type}${type.endsWith("：")?"":"："}${_split(td2.textContent).join("、")}`
                    if(line.length>3)   lines.push(line)
                }

                for(let i=0;i<contentDiv.children.length;i++){
                    const ele = contentDiv.children[i]
                    let trs = ele.querySelectorAll("tr")

                    //处理表格数据
                    if(trs.length>1){
                        let colCount = trs[0].childElementCount
                        if(colCount == 2){
                            //对于两列数据，直接按行取内容
                            trs.forEach(v=> {
                                let td2 = v.children[1]
                                if(td2){
                                    // 第二列为空，则取第一列的数据
                                    if(td2.textContent.trim().length == 0){
                                        _allText(v.children[0])
                                    }
                                    else
                                        _addLine(v.children[0], td2)
                                }
                            })
                        }
                        else if(colCount >=3 && trs.length == 2){
                            //上下结构的表格
                            for (let tdIdx = 0; tdIdx < colCount; tdIdx++) {
                                _addLine(trs[0].children[tdIdx], trs[1].children[tdIdx])
                            }
                        }
                        else {
                            //其他结构，则两列组合为一行数据
                            for (let trIdx = 0; trIdx < trs.length; trIdx++) {
                                const v = trs[trIdx]

                                let tdCount = v.childElementCount
                                if(tdCount>=2 && _test(v.children[tdCount-2], columns.zbr) && _test(v.children[tdCount-1], columns.zbj)){
                                    //多个中标人情况
                                    for (let y = trIdx+1; y < trs.length; y++) {
                                        const zbTr = trs[y]
                                        if(zbTr.childElementCount == tdCount){
                                            extraLines.push([_clean(zbTr.children[tdCount-2].textContent), _clean(zbTr.children[tdCount-1].textContent)])
                                            trIdx ++
                                        }
                                    }
                                }
                                // 还有一种情况，标序号再最左侧，后面接：中标单位、中标价等，暂不处理
                                // http://ggzy.jgswj.gxzf.gov.cn/gxggzy/jyxx/001001/001001003/001001003005/20231113/9e407a84-3c41-48b5-b451-f339172d2361.html
                                // http://ggzy.jgswj.gxzf.gov.cn/gxggzy/jyxx/001001/001001003/001001003005/20231222/470d1091-6cb7-4c19-ad2b-8e7ca4bc8caf.html
                                else if(v.childElementCount % 2 == 0){
                                    // 普通四列数据
                                    for (let tdIdx = 0; tdIdx < v.childElementCount; tdIdx+=2) {
                                        _addLine(v.children[tdIdx], v.children[tdIdx+1])
                                    }
                                }
                            }
                        }
                    }
                    else {
                        _allText(ele)
                    }
                }

                Object.keys(columns).map(key=>{
                    let regex = RegExp(`(${columns[key]})[^：]*：`)
                    for (let index = 0; index < lines.length; index++) {
                        const line = lines[index].replaceAll(' ', "").trim()
                        const m = line.match(regex)
                        if(m){
                            d[key] = line.split(m[0]).pop().replace(/\t/g, "").trim()
                            lines.splice(index, 1)
                            break
                        }
                    }
                })
            }
            else {
                d.status = "N"
            }

            console.debug(`${i+1}/${records.length}`, d)
            //如果没有项目名称，则使用文章标题
            if(!d.xmmc)  d.xmmc = record.title
            //处理报价
            if(d.zbj){
                let jiageM = d.zbj.match(/￥?[,.0-9]+(%|元)?/g)
                jiageM && (d.zbj = jiageM[0].replace(/元|￥|,/g, ""))
            }
            //处理编号，去除 ） 后面的内容
            if(d.xmbh){
                let i = d.xmbh.indexOf("）")
                i>0 && (d.xmbh = d.xmbh.substring(0, i))
            }

            if(extraLines.length>0){
                //多段中标人
                extraLines.forEach(ex=> items.push([d.status, d.xmlx, d.dq, d.xmmc, d.xmbh, d.fbrq, ex[0], ex[1], d.gq, d.xmjl, d.jgbm, d.date, d.url]) )
            }
            else
                items.push([d.status, d.xmlx, d.dq, d.xmmc, d.xmbh, d.fbrq, d.zbr, d.zbj, d.gq, d.xmjl, d.jgbm, d.date, d.url])
        }

        window.items = items
        console.debug(items.map(v=>v.join("\t")).join("\n"))
    })
}
