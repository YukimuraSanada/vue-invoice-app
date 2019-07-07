const debug = require('debug')('service')
const mysql = require('mysql');

class Service {
    constructor (name) {
        debug('new service', name)
        this[`${name ? 'table' : 'db'}`] = require('../db').useTable(name);
        name && (this.table = new this.table());
    }

    // FIXME: refactor this one. This serves for single / multiple updates; separate the jobs!
    async insertOne (params) {
        let response = {};
        const paramsIsArr = Array.isArray(params);

        paramsIsArr && (params = params.map(({ id, ...row }) => row));

        // Some products might not have an expiration date
        if ((params[0] || params).hasOwnProperty('expiration_date'))
            params = params.map(row => ({ ...row, expiration_date: row['expiration_date'] !== '' ? row['expiration_date'] : null }))

        try {

            const keys = Object.keys((paramsIsArr ? params[0] : params)).join(', ');
            const values = paramsIsArr ? params.map(Object.values) : [Object.values(params)];
            
            await this.table.insertOne(keys, values);
            response = {
                message: `Inserted into ${this.tableName} successfully`,
                status: 200
            }
        } catch (err) {
            console.log(err)
            response = {
                message: `Failed to insert into ${this.tableName}`,
                status: 400
            }
        }

        return response;
    }

    async getAll (reversed) {
        let response = {};

        try {
            const data = await this.table.getAll(reversed);

            response = {
                message: `Fetched from ${this.table.currentTable} successfully`,
                status: 200,
                data,
            }
        } catch (err) {
            response = {
                message: `Failed to fetch from ${this.table.currentTable}`,
                reason: err.message,
                status: 400
            }
        }

        return response;
    }

    
    /**
     * 
     *  
     *  ```javascript
     *  const idsAndKVPairs = {
     *   '51': { name: 'provider123', URC: '2222' },
     *   '54': { name: 'provider222' } 
     *  };
     *  const columnNames = [ 'name', 'URC' ];
     *  ```
     */
    /* 
    Computed query:
    update provider t
        join (
            select null as new_name, null as new_URC, null as id 
            union all  
            select  'provider123',  '2222', 51  
            union all  
            select  'provider222',  null, 54 
        ) vals on vals.id = t.id
    set 
        t.name = case when vals.new_name is not null then vals.new_name else t.name end, 
        t.URC = case when vals.new_URC is not null then vals.new_URC else t.URC end 

    */
    async updateOne ([idsAndKVPairs, columnNames]) {
        console.log(idsAndKVPairs, columnNames)
        const punctuation = [', ', ' '];
        const columnNamesLen = columnNames.length;
        
        let setValues = ``;
        let columnValues = ``;
        
        columnValues += `select `;
        
        columnNames.forEach((columnName, columnNameIndex) => {
            columnValues += `null as new_${columnName}, `;
            setValues += `t.${columnName} = case when vals.new_${columnName} is not null then vals.new_${columnName} else t.${columnName} end`;

            setValues += punctuation[+(columnNameIndex === columnNamesLen - 1)]
        });

        columnValues += `null as id`;
        
        for (const id in idsAndKVPairs) {
            const KVPair = idsAndKVPairs[id];

            columnValues += ` union all `;
            columnValues += ` select `

            columnNames.forEach(columnName => {
                columnValues += ` ${KVPair[columnName] ? mysql.escape(KVPair[columnName]) : null}, `;
            })

            columnValues += `${id} `
        }

        const tableName = this.table.currentTable;
        const sql = `
            update ${tableName} t
            join (
                ${columnValues}
            ) vals on vals.id = t.id
            set ${setValues}
        `;

        console.log(sql)
        
        try {
            await this.table._promisify(sql);

            return { message: 'Successfully updated items!' };
        } catch (err) {
            console.error(err);

            return { message: 'err updating items!', err }
        }
        
    }

    async deleteOne ({ id }) {
        try {
            let rowsInfo;
            // If a provider is deleted, we must also delete all the documents that have that provider
            // To do that, call the procedure
            this.table.currentTable !== 'provider' && (await this.table.deleteOne(id))
                || (rowsInfo = await this.table._promisify(`call remove_provider(${id})`))

            return {
                message: 'Successfully deleted',
                rowsInfo
            }
        } catch (err) {
            console.error(err)
            
            return {
                message: 'Error deleting'
            }
        }
    }
}

module.exports = Service;