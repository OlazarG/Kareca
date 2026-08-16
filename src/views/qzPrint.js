function _fmtCurrency(amount) {
    return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG' }).format(amount);
}

async function connectQZ() {
    if (!window.qz || !qz.websocket) {
        throw new Error('QZ Tray no está instalado. Descargálo en https://qz.io');
    }
    try {
        await qz.websocket.connect();
    } catch (e) {
        throw new Error('No se pudo conectar con QZ Tray. Asegurate de que esté ejecutándose.');
    }
}

async function findPrinter() {
    const printers = await qz.printers.find();
    if (!printers || printers.length === 0) {
        throw new Error('No se encontraron impresoras.');
    }
    return printers[0];
}

async function printEscpos(commands) {
    await connectQZ();
    const printer = await findPrinter();
    const config = qz.configs.create(printer);
    const data = [commands];
    await qz.print(config, data);
}

async function disconnectQZ() {
    try { await qz.websocket.disconnect(); } catch (e) { /* ignore */ }
}

async function buildTicketReceipt(ticketData) {
    const { storeName, items, total, method, date, received, change, id } = ticketData;
    const p = new EscposBuilder();

    p.init();
    p.font('b').align('ct').size(1, 1).bold(true).line(storeName || 'Cerámica Café');
    p.font('b').size(0, 0).bold(false).line('Ticket #' + (id || ''));
    p.line(date || new Date().toLocaleString('es-PY'));
    p.feed(1);
    p.align('lt').bold(true).size(0, 0);
    p.separator();

    if (items && items.length > 0) {
        p.bold(false);
        for (const item of items) {
            const name = (item.name || '') + ' ' + (item.variant_name || '');
            const qty = item.qty || item.quantity || 1;
            const lineTotal = item.subtotal || (qty * (item.price || item.unit_price || 0));
            p.formatLine(name + ' x' + qty, _fmtCurrency(lineTotal));
        }
    }

    p.separator();
    p.bold(true).formatLine('TOTAL', _fmtCurrency(total));
    p.bold(false).feed(1);

    const methodLabel = method === 'Efectivo' ? 'EFECTIVO' :
        method === 'Transferencia' ? 'TRANSFERENCIA' :
        method === 'Tarjeta' ? 'TARJETA' : (method || '');
    p.line('Método: ' + methodLabel);

    if (method === 'Efectivo' && received) {
        p.line('Efectivo: ' + _fmtCurrency(received));
        p.line('Vuelto: ' + _fmtCurrency(change || 0));
    }

    p.feed(1);
    p.align('ct').line('¡Gracias Por Su Preferencia!');
    p.feed(3);
    p.cut();

    return p.build();
}

async function printReceipt(ticketData) {
    try {
        const commands = await buildTicketReceipt(ticketData);
        await printEscpos(commands);
        return { success: true, deviceInfo: 'QZ Tray' };
    } catch (error) {
        console.error('QZ Print Error:', error);
        return { success: false, error: error.message };
    } finally {
        await disconnectQZ();
    }
}
