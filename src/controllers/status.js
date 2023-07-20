require('dotenv').config();
const apiSmartolt = require('../api/apiConfigSmart.js');
const apiTelegram = require('../api/apiConfigTelegram.js')
const Onu = require('../models/Onu.js');

const contactsId = [process.env.CONTACT_ID_1, process.env.CONTACT_ID_2, process.env.CONTACT_ID_3];

const sendMessages = async (message) => {
    try {
        await Promise.all(contactsId.map(contactId => apiTelegram.post("/sendMessage", {
            chat_id: contactId,
            text: message,
        })));
    } catch (error) {
        console.error(error);
    }
};

const nuevosOnusEliminarAnteriores = async (onusData) => {
    try {
        const onusLocales = await Onu.find();
        const onusLocalesMap = new Map(onusLocales.map(onuLocal => [onuLocal.unique_external_id, onuLocal]));
        const nuevosOnus = [];
        const onusEliminados = [];
        const onusParaActualizar = [];
        
        onusData.forEach(onuData => {
            if (!onusLocalesMap.has(onuData.unique_external_id) && nuevosOnus.length < 5) {
                nuevosOnus.push(onuData);
            }
            onusLocalesMap.delete(onuData.unique_external_id);
        });
        
        onusEliminados.push(...onusLocalesMap.values());
        
        if (onusEliminados.length > 0) {
            await Onu.deleteMany({ _id: { $in: onusEliminados.map(onu => onu._id) } });
        }
        
        if (nuevosOnus.length > 0) {
            await Promise.all(nuevosOnus.map(onu => dateFail(onu.unique_external_id))).then(dates => {
                const onusInsertar = nuevosOnus.reduce((onusAccum, onu, index) => {
                    if (dates[index] != "") {  // solo añadimos ONU si la fecha no es null
                        onusAccum.push({
                            ...onu,
                            state: true,
                            fecha: dates[index]
                        });
                    }
                    return onusAccum;
                }, []);

                if (onusInsertar.length > 0) {  // solo hacemos la inserción si hay ONU para insertar
                    onusParaActualizar.push(...onusInsertar);
                }
            });
        }

        if (onusParaActualizar.length > 0) {
            await Onu.insertMany(onusParaActualizar);
        }

    } catch (error) {
        console.error(error);
    }
};

const rellenarInfoFaltante = async () => {
    try {
        const onusSinNombre = await Onu.find({
            name: { $exists: false }
        });
        
        if (onusSinNombre.length === 0) {
            return;
        }
        
        const updates = [];
        
        const promises = onusSinNombre.map(async (onuSinNombre) => {
            if (!onuSinNombre.unique_external_id) {
                return;
            }
            const { data } = await apiSmartolt.get(`/onu/get_onu_details/${onuSinNombre.unique_external_id}`);
            updates.push({
                updateOne: {
                    filter: { _id: onuSinNombre._id },
                    update: {
                        $set: {
                            name: data.onu_details.name,
                            odb_name: data.onu_details.odb_name,
                            zone_name: data.onu_details.zone_name
                        }
                    }
                }
            });
        });
        
        await Promise.all(promises);
        
        if (updates.length > 0) {
            await Onu.bulkWrite(updates);
        }
        
    } catch (error) {
        console.error(error);
    }
};

const dateFail = async (onu_external_id) => {
    try {
        const { data } = await apiSmartolt.get(`/onu/get_onu_full_status_info/${onu_external_id}`)
        const history = data.full_status_json.History;
        const lastPosition = Object.keys(history)
            .map(Number)
            .reduce((a, b) => Math.max(a, b))
            .toString();
        const lastPowerFail = history[lastPosition]['Offline at'];
        return lastPowerFail;
    } catch (error) {
        console.error(error);
    }
};

const performOnusCheck = async () => {
    try {
        await Onu.updateMany({}, { state: false });
        const { data } = await apiSmartolt.get("/onu/get_onus_statuses");
        const onus = data.response
            .filter((onu) =>
                (onu.status === "Power fail" || onu.status === "LOS") &&
                onu.unique_external_id !== null
            )
            .map((onu) => ({
                unique_external_id: onu.unique_external_id,
                status: onu.status,
            }));
        if (onus.length === 0) {
            return;
        }
        await nuevosOnusEliminarAnteriores(onus);
        await rellenarInfoFaltante();
        const nuevosOnus = await Onu.find({ state: true });
        if (nuevosOnus.length > 0) {
            const messageParts = [
                `Se detectaron ${nuevosOnus.length} nuevas ONUs con Problemas:\n`,
                "---------------------------------------------------------------------\n",
                ...nuevosOnus.map(onu =>
                    `Nombre: ${onu.name}\nODB: ${onu.odb_name}\nZona: ${onu.zone_name}\nFecha: ${onu.fecha}\nStatus: ${onu.status}\n---------------------------------------------------------------------\n`),
            ];
            await sendMessages(messageParts.join(''));
        }
    } catch (error) {
        console.error(error);
    }

};

module.exports = {
    performOnusCheck
}