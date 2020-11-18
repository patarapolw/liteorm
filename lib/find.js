"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCond = void 0;
const utils_1 = require("./utils");
/**
 *
 * @param q
 * @param cols
 */
function parseCond(q, cols, params) {
    const subClause = [];
    if (Array.isArray(q.$or)) {
        subClause.push(q.$or.map((el) => parseCond(el, cols, params)).join(' OR '));
    }
    else if (Array.isArray(q.$and)) {
        subClause.push(q.$and.map((el) => parseCond(el, cols, params)).join(' AND '));
    }
    else {
        subClause.push(_parseCondBasic(q, cols, params));
    }
    if (subClause.length > 0) {
        return subClause.join(' AND ');
    }
    return 'TRUE';
}
exports.parseCond = parseCond;
function _parseCondBasic(cond, cols, params) {
    const cList = [];
    function doDefault(k, v) {
        const vParam = params.add(v);
        /**
         * Already a safen column name
         */
        if (strArrayCols.includes(k)) {
            cList.push(`${k} LIKE '%\x1f'||${vParam}||'\x1f%'`);
        }
        else {
            cList.push(`${k} = ${vParam}`);
        }
    }
    const strArrayCols = Object.values(cols).map((c) => {
        const strArrayFields = Object.entries(c.m.__meta.prop)
            .filter(([_, v]) => v && v.type === 'StringArray')
            .map(([k]) => k);
        return [
            ...strArrayFields.map((f) => utils_1.safeColumnName(f)),
            ...strArrayFields.map((f) => `${c.m.__meta.name}__${f}`),
        ];
    }).reduce((prev, c) => [...prev, ...c], []);
    for (let [k, v] of Object.entries(cond)) {
        let isPushed = false;
        if (k.includes('.')) {
            const kn = k.split('.');
            k = `json_extract(${utils_1.safeColumnName(kn[0])}, '$.${utils_1.safeColumnName(kn.slice(1).join('.'))}')`;
        }
        else {
            k = utils_1.safeColumnName(k);
        }
        const isStrArray = strArrayCols.includes(k);
        if (v instanceof Date) {
            v = +v;
        }
        if (v) {
            if (Array.isArray(v)) {
                if (isStrArray) {
                    cList.push(v.map((v0) => {
                        const vParam = params.add(v0);
                        return `${k} LIKE '%\x1f'||${vParam}||'\x1f%'`;
                    }).join(' AND '));
                }
                else {
                    if (v.length > 1) {
                        cList.push(`${k} IN (${v.map((v0) => `${params.add(v0)}`).join(',')})`);
                    }
                    else if (v.length === 1) {
                        cList.push(`${k} = ${params.add(v[0])}`);
                    }
                }
            }
            else if (typeof v === 'object' && v.constructor === Object) {
                const collate = v.$collate
                    ? `COLLATE ${v.$collate}` : '';
                delete v.$collate;
                const op = Object.keys(v)[0];
                let v1 = v[op];
                if (v1 instanceof Date) {
                    v1 = +v1;
                }
                if (Array.isArray(v1)) {
                    switch (op) {
                        case '$in':
                            if (isStrArray) {
                                cList.push(v1.map((v0) => {
                                    return `${k} LIKE '%\x1f'||${params.add(v0)}||'\x1f%' ${collate}`;
                                }).join(' OR '));
                            }
                            else {
                                if (v1.length > 1) {
                                    cList.push(`${k} IN (${v1.map((v0) => params.add(v0)).join(',')}) ${collate}`);
                                }
                                else if (v1.length === 1) {
                                    cList.push(`${k} = ${params.add(v1[0])} ${collate}`);
                                }
                            }
                            isPushed = true;
                            break;
                        case '$nin':
                            if (v1.length > 1) {
                                cList.push(`${k} NOT IN (${v1.map((v0) => params.add(v0)).join(',')}) ${collate}`);
                            }
                            else {
                                cList.push(`${k} != ${params.add(v1[0])} ${collate}`);
                            }
                            isPushed = true;
                            break;
                    }
                }
                if (isPushed) {
                    continue;
                }
                if (v1 && typeof v1 === 'object') {
                    if (v1 instanceof Date) {
                        k = `json_extract(${k}, '$.$milli')`;
                        v1 = +v1;
                    }
                    else {
                        v1 = JSON.stringify(v1);
                    }
                }
                switch (op) {
                    case '$like':
                        cList.push(`${k} LIKE ${params.add(v1)} ${collate}`);
                        break;
                    case '$nlike':
                        cList.push(`${k} NOT LIKE ${params.add(v1)} ${collate}`);
                        break;
                    case '$substr':
                        cList.push(`${k} LIKE '%'||${params.add(v1)}||'%' ${collate}`);
                        break;
                    case '$nsubstr':
                        cList.push(`${k} NOT LIKE '%'||${params.add(v1)}||'%' ${collate}`);
                        break;
                    case '$exists':
                        cList.push(`${k} IS ${v1 ? 'NOT NULL' : 'NULL'} ${collate}`);
                        break;
                    case '$gt':
                        cList.push(`${k} > ${params.add(v1)} ${collate}`);
                        break;
                    case '$gte':
                        cList.push(`${k} >= ${params.add(v1)} ${collate}`);
                        break;
                    case '$lt':
                        cList.push(`${k} < ${params.add(v1)} ${collate}`);
                        break;
                    case '$lte':
                        cList.push(`${k} <= ${params.add(v1)} ${collate}`);
                        break;
                    case '$ne':
                        cList.push(`${k} != ${params.add(v1)} ${collate}`);
                        break;
                    case '$eq':
                        cList.push(`${k} = ${params.add(v1)} ${collate}`);
                        break;
                    default:
                        doDefault(k, v);
                }
            }
            else {
                doDefault(k, v);
            }
        }
        else {
            doDefault(k, v);
        }
    }
    if (cList.length > 0) {
        return cList.join(' AND ');
    }
    return 'TRUE';
}
//# sourceMappingURL=find.js.map