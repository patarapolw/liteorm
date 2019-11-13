"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function condToWhere(cond) {
    const cList = [];
    const params = [];
    for (let [k, v] of Object.entries(cond)) {
        if (k.includes(".")) {
            const kn = k.split(".");
            k = `json_extract("${kn[0]}", '$.${kn.slice(1).join(".")}')`;
        }
        if (v && (v.constructor === {}.constructor || Array.isArray(v))) {
            const v0 = Object.keys(v)[0];
            const v1 = v[v0];
            switch (v0) {
                case "$like":
                    cList.push(`"${k}" LIKE ?`);
                    params.push(v1);
                    break;
                case "$exists":
                    cList.push(`"${k}" IS ${v1 ? "NOT NULL" : "NULL"}`);
                    break;
                case "$in":
                    if (v1.length > 1) {
                        cList.push(`"${k}" IN (${v1.map((_) => "?").join(",")})`);
                        params.push(...v1);
                    }
                    else {
                        cList.push(`"${k}" = ?`);
                        params.push(v1[0]);
                    }
                    break;
                case "$gt":
                    cList.push(`"${k}" > ?`);
                    params.push(v1);
                    break;
                case "$gte":
                    cList.push(`"${k}" >= ?`);
                    params.push(v1);
                    break;
                case "$lt":
                    cList.push(`"${k}" < ?`);
                    params.push(v1);
                    break;
                case "$lte":
                    cList.push(`"${k}" <= ?`);
                    params.push(v1);
                    break;
                default:
                    v = JSON.stringify(v);
                    cList.push(`"${k}" = ?`);
                    params.push(v);
            }
        }
        else {
            cList.push(`"${k}" = ?`);
            params.push(v);
        }
    }
    return cList.length > 0 ? {
        clause: cList.join(" AND "),
        params
    } : null;
}
exports.condToWhere = condToWhere;
