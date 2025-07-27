// Importar las dependencias necesarias
    const { createBot,createProvider,createFlow,addKeyword,EVENTS } = require('@bot-whatsapp/bot');
    require("dotenv").config;
    const QRPortalWeb = require('@bot-whatsapp/portal');
    const BaileysProvider = require('@bot-whatsapp/provider/baileys');
    const chrono = require('chrono-node');
//base
    const MongoAdapter = require('@bot-whatsapp/database/mongo');
//para lectura
    const path = require ("path");
    const fs = require("fs");
//openAI
    const chat = require("./chatGPT");
    const { set } = require('mongoose');

//ARCHIVOS DE TEXTO PARA LOS MENUS
    const menuPath = path.join(__dirname,"mensajes","menu.txt");
    const menu = fs.readFileSync(menuPath,"utf-8");
//RESPUESTAS DEL BOT
    const consultaPath = path.join(__dirname,"mensajes","promptConsultas.txt");
    const resBot = fs.readFileSync(consultaPath,"utf8");
//base
    let adapterDB;
// Inicializar la conexión con MongoDB
    const conectarMongoDB = async () => {
        adapterDB = new MongoAdapter({
        dbUri: 'mongodb://127.0.0.1:27017/', 
        dbName: "usuarios"
        });
        console.log("✅ Conexión con MongoDB establecida correctamente.");
    };

    let nombreUsuario = "";

    const flowBienvenida = addKeyword(EVENTS.WELCOME)
        .addAnswer("Hola, soy *TheBot* 🤖 Asistente Virtual de Stella Spa")
        .addAnswer("Antes de continuar, ¿me indicas tu nombre y apellido?", { capture: true }, async (ctx, { gotoFlow, flowDynamic }) => {
                const nombreUsuario = ctx.body.trim();
                const regexNombreValido = /^[A-Za-zÁÉÍÓÚÑáéíóúñ\s'-]{2,}$/;

                if (!regexNombreValido.test(nombreUsuario)) {
                await flowDynamic("❌ Nombre inválido. Usa solo letras y espacios. Ej: Juan Pérez.");
                return;
                }            
            const telefono = ctx.from;
            const pacientesCollection = adapterDB.db.collection('pacientes');
            const pacienteInfo = adapterDB.db.collection('historialclinfobas');
                try{
                    const pacienteExistente = await pacientesCollection.findOne({ telefono });
                    if (!pacienteExistente) {
                        const resultadoInsert = await pacientesCollection.insertOne({
                            nombre: nombreUsuario,
                            telefono
                        });

                        const pacienteId = resultadoInsert.insertedId;
                       
                    await pacienteInfo.insertOne({
                            paciente_id: pacienteId,
                            telefono,
                            nombre_completo: nombreUsuario,
                            fecha_nacimiento: "",
                            edad: "",
                            genero: "",
                            direccion: "",
                            correo: "",
                            fecha_ingreso: new Date(),
                            sangre: "",
                            peso: "",
                            altura: "",
                            alergias: "",
                            enfermedades: "",
                            contacto_emergencia: "",
                            relacion: "",
                            telefono_emergencia: "",
                        });
                    } else {
                        console.log('👤 Paciente ya registrado');
                    }
                    } catch (error) {
                    console.error('❌ Error al guardar paciente:', error);
                    }
            await flowDynamic(`¡Bienvenido, *${nombreUsuario}*! 😊`);
        return gotoFlow(menuFlow);
    });

    // Flujo del menú principal
    const menuFlow = addKeyword(EVENTS.ACTION)
        .addAnswer(
            menu,
                { capture: true },
                    async (ctx, { gotoFlow, fallBack, flowDynamic }) => {
                        if (!["1", "2", "3", "0"].includes(ctx.body)) {
                        return fallBack(
                        "Respuesta no válida, por favor selecciona una de las opciones."
                        );
                        }
                            switch (ctx.body) {
                                case "1":
                                    return gotoFlow(flowServicios);
                                case "2":
                                    return gotoFlow(flowCita);
                                case "3":
                                    return gotoFlow(flowRecomendaciones);
                                case "0":
                                    return await flowDynamic(
                                    "Me alegra haber podido ayudarte 😄\n Recuerda que si tienes alguna duda, con gusto te puedo ayudar"
                                );
                            }
                        }
        );

    // flujo de interaccion con el bot
    const flowServicios = addKeyword(EVENTS.ACTION)
        .addAnswer("Puedes preguntarme sobre nuestros servicios ✨. Cuando quieras salir, escribe *0*.", {
            capture: true
        }, 
            async (ctx, ctxFn) => {
                const consulta = ctx.body.trim();
                    if (consulta === "0") {
                        await ctxFn.flowDynamic("¡Perfecto! Gracias por tu tiempo. Si necesitas algo más, no dudes en escribirme 😊");
                        return ctxFn.gotoFlow(menuFlow);
                    }
                const palabrasCita = ["agendar", "cita", "separar", "reservar", "Agendar"];
                const quiereCita = palabrasCita.some(p => consulta.includes(p));
                    if (quiereCita) {
                        await ctxFn.flowDynamic("¡Perfecto! Te ayudaré a agendar tu cita 🗓️");
                        return ctxFn.gotoFlow(flowCita);
                    }
                const serviciosCollection = adapterDB.db.collection('servicios');
                const servicios = await serviciosCollection.find().toArray();
                const promptServicios = servicios
                    .map((s, i) => `${i + 1}. ${s.nombre}: ${s.contenido}`)
                    .join("\n");
                const prompt = `
                    Eres un asistente de estética. 
                    Usa palabras para ambos generos femenino/masculino
                    le dices que ingrese la palabra agendar/cita/reservar si quiere una cita 
                    No pidas metodos de pagos
                    No le pidas numero para agendar cita
                    Usa solo la siguiente información para responder preguntas de clientes de forma clara y breve:
                    ${promptServicios}
                    Consulta del usuario: "${consulta}"
                    .
                `;
                const respuesta = await chat(prompt, consulta);
                await ctxFn.flowDynamic(respuesta.content);
            return ctxFn.gotoFlow(flowServicios);
        });

// Variables globales para almacenar los datos
    let globalHora = "";
    let fecha = "";

// flujo para agendar citas
  const flowCita = addKeyword(EVENTS.ACTION)
    .addAnswer('*Importante*: \n ℹ️ - Para agendar tu cita, utilice su propio dispositivo móvil.')
    .addAnswer('¿Cuál es la fecha para tu cita? 📆 \n (Formatos: ej. - DD/MM, - 01-05-2025)', { capture: true }, async (ctx, ctxFn) => {
    const entradaFecha = ctx.body;
    const globalFecha = chrono.es.parseDate(entradaFecha);
    
        if (!globalFecha) {
            await ctxFn.flowDynamic("❌ No entendí la fecha. Por favor ingresa una fecha válida como 'hoy', 'mañana', '28 de este mes' o '2025-07-01'.");
            return await ctxFn.gotoFlow(flowCita);
        }

    const zonaOffsetHoras = -5;
    const fechaLocal = new Date(globalFecha.getTime() + zonaOffsetHoras * 60 * 60 * 1000);
    const fechaHoy = new Date();
    fechaHoy.setHours(0, 0, 0, 0);
    fechaLocal.setHours(0, 0, 0, 0);

        if (fechaLocal < fechaHoy || fechaLocal.getFullYear() !== fechaHoy.getFullYear()) {
            await ctxFn.flowDynamic("📅 Solo puedes agendar una cita desde hoy en adelante y dentro del año actual. Inténtalo nuevamente.");
            return await ctxFn.gotoFlow(flowCita);
        }else{
            // Guardar en variable global si es válida
            fecha = entradaFecha;
            await ctxFn.gotoFlow(flowHora);
        }
  })

//flujo de la hora
  const flowHora = addKeyword(EVENTS.ACTION)
     .addAnswer('¿A qué hora te gustaría agendarla?\n Formato: ej. - 4pm o 16:00', { capture: true }, async (ctx, ctxFn) => {
        globalHora = ctx.body; 
        const telefonoUsuario = ctx.from; 
       
        //fecha almacenada del flujo anterior
        const globalFecha = chrono.es.parseDate(fecha);
        const zonaOffsetHoras = -5; 
        const fechaLocal = new Date(globalFecha.getTime() + zonaOffsetHoras * 60 * 60 * 1000);
        fecha_separada = fechaLocal.toISOString().split('T')[0];


        const fechaDetectada = chrono.es.parseDate(globalHora);
            if (!fechaDetectada) {
                await ctxFn.flowDynamic("⏰ No entendí la hora. Usa un formato válido como '14:00', '4pm', '8:30am'.");
                return await ctxFn.gotoFlow(flowHora);
            }

        const horas = fechaDetectada.getHours().toString().padStart(2, '0');
        const minutos = fechaDetectada.getMinutes().toString().padStart(2, '0');
        const horaFormateada = `${horas}:${minutos}`;
        globalHora = horaFormateada;
    
            if (fechaDetectada.getHours() < 8 || fechaDetectada.getHours() >= 19) {
                await ctxFn.flowDynamic("🕒 Solo se permiten citas entre las 08:00 y las 19:00. Intenta otra hora.");
                return await ctxFn.gotoFlow(flowHora);
            }

        //colecciones 
        const pacientesCollection = adapterDB.db.collection("pacientes");
        const agendasCollection = adapterDB.db.collection("agendas");

            try {
                const paciente = await pacientesCollection.findOne({ telefono: telefonoUsuario });
                    if (!paciente) {
                        await ctxFn.flowDynamic("❌ No se encontró tu registro. Por favor vuelve al inicio y proporciona tu nombre.");
                        return;
                    }
                const citaExistente = await agendasCollection.findOne({
                    fecha: fecha_separada,
                    hora: horaFormateada
                });

                    if (citaExistente) {
                        await ctxFn.flowDynamic(`🚫 Ya hay una cita registrada para el ${fecha_separada} a las ${globalHora}. Por favor elige otra hora o cambia la fecha.`);
                        return ctxFn.gotoFlow(flowCita);
                    }

                const yaTieneCita = await agendasCollection.findOne({
                    telefono: telefonoUsuario,
                    fecha: fecha_separada,
                    hora: horaFormateada
                });
                
                    if (yaTieneCita) {
                        await ctxFn.flowDynamic(`🚫 Ya tienes una cita agendada para ese dia`);
                        return ctxFn.gotoFlow(menuFlow);
                    }               

                const nuevaCita = {
                    paciente_id: paciente._id,
                    nombre: paciente.nombre,
                    fecha: fecha_separada,
                    hora: horaFormateada,
                    telefono: telefonoUsuario,
                    status: "pendiente"
                };
                await agendasCollection.insertOne(nuevaCita);
                console.log("✅ Cita guardada en la base de datos:", nuevaCita);
                console.log("📌 Cita guardada con nombre:", paciente.nombre);

                const dia = fechaLocal.getDate().toString().padStart(2, '0');
                const mes = (fechaLocal.getMonth() + 1).toString().padStart(2, '0'); // los meses van de 0 a 11
                const anio = fechaLocal.getFullYear();
                fecha_separada = `${dia}/${mes}/${anio}`;

                await ctxFn.flowDynamic(`✅ Listo ${paciente.nombre}. Tu cita ha sido confirmada para el ${fecha_separada} a las ${globalHora}.\n Te esperamos!!👋💆`);
                    if(sock){
                        const numero = "593978825644@c.us";
                        const telefonoLocal = telefonoUsuario.replace(/^593/, '0');
                        const mensaje = `📅 *Nueva cita agendada*\n\n👤 *Paciente:* ${paciente.nombre}\n📞 *Teléfono:* ${telefonoLocal}\n🗓️ *Fecha:* ${fecha_separada}\n⏰ *Hora:* ${globalHora}`;
                            await sock.sendMessage(numero, { text: mensaje });
                    } else {
                        console.warn("❗ sock no está listo para enviar mensajes.");
                    }
                return ctxFn.gotoFlow(flowDespuesDeCita);
                //return ctxFn.gotoFlow(menuFlow);

            } catch (error) {
                console.error("❌ Error al guardar la cita en MongoDB:", error);
                await ctxFn.flowDynamic("❌ Ocurrió un error al guardar tu cita. Inténtalo nuevamente.");
        }
    });


    // Este flujo va después de guardar la cita
    const flowDespuesDeCita = addKeyword(EVENTS.ACTION)
    .addAnswer("📌 Si deseas volver al menú principal, escribe *1*. De lo contrario, puedes cerrar esta conversación. 😊", { capture: true }, async (ctx, ctxFn) => {
        const entrada = ctx.body.trim();

        if (entrada === "1") {
        await ctxFn.flowDynamic("🔄 Redirigiéndote al menú principal...");
        return await ctxFn.gotoFlow(menuFlow);
        } else {
        await ctxFn.flowDynamic("👍 ¡Gracias por agendar tu cita! Que tengas un buen día. 👋");
        return; // Aquí termina el flujo
        }
    });



    // flujo de recomendaciones
    const flowRecomendaciones = addKeyword(EVENTS.ACTION)
        .addAnswer("📋 Estoy buscando tus tratamientos para darte recomendaciones personalizadas. Un momento...", {}, async (ctx, ctxFn) => {
            const telefono = ctx.from;
            const tratamientoCollection = adapterDB.db.collection('tratamientos');
            const tratamientosUsuario = await tratamientoCollection.find({ telefono }).toArray();
                if (!tratamientosUsuario.length) {
                    await ctxFn.flowDynamic(`No encontré tratamientos registrados para tu número (${telefono}). Si crees que es un error, por favor contáctanos directamente 💬.`);
                    return ctxFn.gotoFlow(menuFlow);
                }
        // Limitar a los 3 primeros tratamientos
            const tratamientosLimitados = tratamientosUsuario
                .map((t, i) => `${i + 1}. Tratamiento: ${t.tratamiento}
                Observaciones: ${t.observaciones}
                Evaluación: ${t.evaluacion}`
                )
                .join("\n\n");
            const prompt = `
                Actúa como un experto que analiza texto y da recomendaciones puntuales.
                    - Lee el siguiente texto.
                    - No lo resumas completo.
                    - Devuelve solo entre 2 y 5 recomendaciones útiles, claras y accionables.
                    - Sé directo, evita repetir lo que ya dice el texto.
                    - Las recomendaciones deben ser prácticas y fáciles de entender.
                    - Relacionadas con los tratamientos del cliente.
                    - Como adicional recomienda futuras terapias que deberia realizar el cliente.
                Historial del cliente (teléfono: ${telefono}):
                ${tratamientosLimitados}
                `;
            const respuesta = await chat(prompt, telefono);
                if (!respuesta?.content) {
                    await ctxFn.flowDynamic("No pude generar recomendaciones en este momento. Por favor intenta más tarde 🙏.");
                    return ctxFn.gotoFlow(menuFlow);
                }
            await ctxFn.flowDynamic(respuesta.content);
        return ctxFn.gotoFlow(menuFlow);
    });

const enviarrecordatorio = async () => {
    if (!sock) {
        console.warn("⚠️ No se puede enviar recordatorios: sock no está listo.");
        return;
    }

    const agendasCollection = adapterDB.db.collection("agendas");
    const pacientesCollection = adapterDB.db.collection("pacientes");

    // Función para formatear fecha como YYYY-MM-DD
    const formatDate = (fecha) => {
        const yyyy = fecha.getFullYear();
        const mm = String(fecha.getMonth() + 1).padStart(2, '0');
        const dd = String(fecha.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    };

    // Obtener "mañana"
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const mananaStr = formatDate(manana);

    console.log("🔔 Buscando citas para mañana:", mananaStr);

    const citas = await agendasCollection.find({
        fecha: mananaStr,           // ⬅️ citas para mañana (como string)
        status: "pendiente"
    }).toArray();

    console.log("📅 Citas encontradas:", citas.length);

    for (const cita of citas) {
        const paciente = await pacientesCollection.findOne({ telefono: cita.telefono });
        if (!paciente) continue;

        const mensaje = `📌 *Recordatorio de cita*:
👤 *${paciente.nombre}*
🗓️ *Fecha:* ${cita.fecha}
⏰ *Hora:* ${cita.hora}
Te esperamos en Stella Spa ✨`;

        const numeroWhatsApp = `${cita.telefono.replace(/^0/, "593")}@c.us`;

        try {
            await sock.sendMessage(numeroWhatsApp, { text: mensaje });
            console.log("✅ Recordatorio enviado a", paciente.nombre);
        } catch (err) {
            console.error("❌ Error al enviar recordatorio a", paciente.nombre, err.message);
        }
    }
};



let sock = null;
const main = async () => {
    await conectarMongoDB();

    const adapterFlow = createFlow([
        flowBienvenida,
        menuFlow,
        flowServicios,
        flowCita,
        flowHora,
        flowRecomendaciones,
        flowDespuesDeCita
               
    ])
    const adapterProvider = createProvider(BaileysProvider);
    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    setTimeout(async () => {
            try {
                const instance = await adapterProvider.getInstance();
                sock = instance;

                console.log("✅ Socket listo para enviar mensajes");
                 await enviarrecordatorio(); // Enviar recordatorios al iniciar

              //  setTimeout(enviarrecordatorio); // Ejecutar cada 24 horas


            } catch (err) {
                console.error("❌ No se pudo obtener el socket:", err);
            }
        }, 2000); 

    QRPortalWeb();
}

main()
