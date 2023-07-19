const mongoose = require('mongoose');
require('dotenv').config();

const dbConnection = async() => {

    try {
        mongoose.set('strictQuery', false);
        await mongoose.connect(process.env.DB_CNN);
        console.log('BD online');
    } catch (error) {
        console.log(error);
        throw new Error('Error a la hora de iniciar la BD ver logs');
    }

};

module.exports = {
    dbConnection
};