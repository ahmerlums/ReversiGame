const url = 'mongodb://localhost:8000/my_database_name'
const mongodb = require('mongodb')
const MongoClient = mongodb.MongoClient
const express = require('express')
const app = express()
const server = require('http').createServer(app)
// Use connect method to connect to the Server

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/client.html')
})
app.get('/spectate', (req, res) => {
    res.sendFile(__dirname + '/spectate.html')
})

const io = require('socket.io')(server)
const games = {}
let numberOfgames = 0
let waiting = 1
const negOne = -1
const negTwo = -2
const zero = 0
const one = 1
const two = 2
const three = 3
const seven = 7
const nine = 9
const eight = 8
const sixtyfour = 64
const twentyseven = 27
const twentyeight = 28
const thrityfive = 35
const thritysix = 36
let id = 0
let specid = 0
const specList = []

MongoClient.connect(url, (err, db) => {
    if (err) {
        console.log('Unable to connect to the mongoDB server. Error:', err)
    } else {
         db.dropDatabase()
        const collection = db.collection('games')
        const collection1 = db.collection('waiting')
        evalDb(collection, collection1)
        console.log('Connection established to ' + url)
        io.on('connection', client => {
            const clid = parseInt(client.handshake.query.id)
            if (clid !== negTwo) {
                initializePlayer(client, collection, collection1, clid)
                client.on('move', (msg) => {
                    onmove(msg, client, collection)
                })
                client.on('validmoves', (msg) => {
                    onvalidmove(client, msg)
                })
                client.on('disconnect', (client) => {
                    ondisconnect(client)
                })
            } else {
                sendGames(client)
                client.on('getGame', (id, sid) => {
                    sendGame(id, client, sid)
                })
            }
        })
    }
})

function sendGame(id, client, sid) {
    console.log('spectator#' + sid + ' wants to see game#' + id)
    for (let i = 1; i <= numberOfgames; i++) {
        if (games['game' + i]['spec' + sid] === client) {
            games['game' + i]['spec' + sid] = undefined
        }
    }
    client.emit('board', games['game' + id].board)
    games['game' + id]['spec' + sid] = client
}


function sendGames(client) {
    specid++
    specList.push(client)
    console.log('Spectator Connected')
    client.emit('ev', numberOfgames, specid)
}


function evalDb(collection, collection1) {
    const cursor = collection.find()
    cursor.each((err, doc) => {
        if (err) {
            console.log(err)
        } else {
            if (doc !== null) {
                games['game' + doc.gamenum] = {
                    players: doc.players,
                    board: doc.board,
                }
            }
        }
    })
    const cursor1 = collection1.find()
    cursor1.each((err, doc) => {
        if (err) {
            console.log(err)
        } else {
            if (doc !== null) {
                numberOfgames = doc.numgames
                waiting = doc.wait
                id = doc.maxcId
            }
        }
    })
}

function initializePlayer(client, collection, collection1, clid) {
    if (clid !== negOne) {
        if (clid % two === one) {
            startP1(client, collection, collection1, clid)
        } else {
            startP2(client, collection, collection1, clid)
        }
    } else if (waiting === one) {
        startP1(client, collection, collection1, clid)
    } else {
        startP2(client, collection, collection1, clid)
        for (let i = 0; i < specid; i++) {
            specList[i].emit('ev', numberOfgames, i + one)
        }
    }
}


function onmove(msg, client, collection) {
    const g = getGame(client)
    if (games['game' + g[zero]].players[g[one]][one] === one) {
        const data = setAndGetData(g, msg, client)
        const cond1 = data[two] === zero && data[three] === zero
        const cond2 = boardfull(g[zero]) === one
        if (cond1 || cond2) {
            moveHelper(client, g[zero], data[zero], data[one])
        }
        if (data[two] === one && data[three] === zero) {
            passTurn(client, g[zero])
        }
        updateCollection(collection, g[zero], games['game' + g[zero]])
    }
}

function updateCollection(collection, n, mygame) {
    advanceToNextTurn(n)
    collection.update({
        gamenum: n,
    },
        {
            gamenum: n,
            players: [
                [mygame.players[zero][two], mygame.players[zero][one]],
                [mygame.players[one][two], mygame.players[one][one]],
            ],
            board: mygame.board,
        }
        )
}

function onvalidmove(client, msg) {
    const g = getGame(client)
    const gameno = g[zero]
    if (games['game' + gameno].players[g[one]][one] === one) {
        const pls = oppme(client, gameno, msg, false)
        const board = checkboard(msg, pls[zero], pls[one], zero, gameno)
        client.emit('isvalid', board, msg)
    }
}

function setAndGetData(g, msg, client) {
    games['game' + g[zero]].players[g[one]][one] = zero
    games['game' + g[zero]].players[g[two]][one] = one
    const pl1 = games['game' + g[zero]].players[one][zero]
    const pl2 = games['game' + g[zero]].players[zero][zero]
    const pls = sendBoard(client, msg, g[zero], pl1, pl2)
    const a = wincheck(pls[one], pls[zero], g[zero])
    const b = wincheck(pls[zero], pls[one], g[zero])
    return [pl1, pl2, a, b]
}

function advanceToNextTurn(n) {
    let players = undefined
    if (games['game' + n].players[zero][one] === one) {
        const p1 = games['game' + n].players[zero][zero]
        const p2 = games['game' + n].players[one][zero]
        players = [p1, p2]
    } else {
        const p1 = games['game' + n].players[one][zero]
        const p2 = games['game' + n].players[zero][zero]
        players = [p1, p2]
    }
    players[zero].emit('go')
    players[one].emit('wait')
}

function moveHelper(client, n, pl1, pl2, opp, me) {
    let p1 = zero
    let p2 = zero
    if (me === 'X') {
        p1 = checkwinner(n)[zero]
        p2 = checkwinner(n)[one]
    } else {
        p1 = checkwinner(n)[one]
        p2 = checkwinner(n)[zero]
    }
    endGame(p1, p2, client, pl1, pl2, n)
}

function passTurn(client, n) {
    client.emit('Lock', 'Your Turn')
    if (client === games['game' + n].players[zero][zero]) {
        games['game' + n].players[zero][one] = one
        games['game' + n].players[one][one] = zero
        games['game' + n].players[one][zero].emit('Lock', 'Turn Passed')
    } else {
        games['game' + n].players[zero][one] = zero
        games['game' + n].players[one][one] = one
        games['game' + n].players[zero][zero].emit('Lock', 'Turn Passed')
    }
}

function ondisconnect(client) {
    for (let i = one; i <= numberOfgames; i++) {
        const cond1 = games['game' + i].players[zero] === client
        const cond2 = games['game' + i].players[one] === client
        if (cond1 || cond2) {
            games['game' + i].players[zero].emit('disconnect')
            games['game' + i].players[one].emit('disconnect')
        }
    }
}

function endGame(p1, p2, client, pl1, pl2) {
    if (p1 > p2) {
        pl1.emit('GameEnd', 'Winner')
        pl2.emit('GameEnd', 'Loser')
    } else if (p1 < p2) {
        pl1.emit('GameEnd', 'Loser')
        pl2.emit('GameEnd', 'Winner')
    } else {
        pl1.emit('GameEnd', 'Draw')
        pl2.emit('GameEnd', 'Draw')
    }
}


function sendBoard(client, msg, n, pl1, pl2) {
    const pls = oppme(client, n, msg, true)
    checkboard(msg, pls[zero], pls[one], one, n)
    pl1.emit('board', games['game' + n].board)
    pl2.emit('board', games['game' + n].board)
    for (let i = 1; i <= specid; i++) {
        if (games['game' + n]['spec' + i] !== undefined) {
            games['game' + n]['spec' + i].emit('board', games['game' + n].board)
        }
    }
    return pls
}

function oppme(client, n, msg, moveFlag) {
    const wasFirst = getGame(client)[one]
    const myarr = []
    markMove(moveFlag, wasFirst, msg, n)
    if (wasFirst === zero) {
        myarr[one] = 'O'
        myarr[zero] = 'X'
    } else {
        myarr[one] = 'X'
        myarr[zero] = 'O'
    }
    return myarr
}

function markMove(moveFlag, wasFirst, msg, n) {
    if (moveFlag === true && wasFirst === zero) {
        games['game' + n].board[msg] = 'X'
    } else if (moveFlag === true && wasFirst === one) {
        games['game' + n].board[msg] = 'O'
    }
}


function getGame(client) {
    for (let i = one; i <= numberOfgames; i++) {
        if (games['game' + i].players[zero][zero] === client) {
            return [i, zero, one]
        } else if (games['game' + i].players[one][zero] === client) {
            return [i, one, zero]
        }
    }
    return undefined
}

function startP1(client, collection, collection1, clid) {
    if (clid === negOne) {
        updateParams(one)
        games['game' + numberOfgames] = {
            players: [[client, one, id]],
            board: [],
        }
        setBoard()
        const p1 = {
            gamenum: numberOfgames,
            players: [[id, one]],
            board: games['game' + numberOfgames].board,
        }
        collection.insert(p1)
        console.log('Player 1 of Game#' + numberOfgames + ' connected!')
        client.emit('init', id)
        collection1.find().count((err, count) => {
            if (count === zero) {
                collection1.insert({
                    id: one,
                    wait: zero,
                    numgames: numberOfgames,
                    maxcId: id,
                })
            } else {
                collection1.update({
                    id: one,
                }, {
                    id: one,
                    wait: zero,
                    numgames: numberOfgames,
                    maxcId: id,
                })
            }
        })
    } else {
        helperStart(clid, client, zero)
    }
}

function helperStart(clid, client, p) {
    for (let i = 1; i <= numberOfgames; i++) {
        if (games['game' + i] !== undefined) {
            if (games['game' + i].players[p][zero] === clid) {
                games['game' + i].players[p][zero] = client
                games['game' + i].players[p][two] = clid
                if (p === zero) {
                    console.log('P1 of game#' + i + ' reconnected')
                } else {
                    console.log('P2 of game#' + i + ' reconnected')
                }
                break
            }
        }
    }
}

function updateParams(flag) {
    id++
    if (flag === one) {
        numberOfgames++
        waiting = zero
    } else {
        waiting = one
    }
}

function startP2(client, collection, collection1, clid) {
    if (clid === negOne) {
        updateParams(zero)
        const curgame = games['game' + numberOfgames]
        curgame.players[one] = [client, zero, id]
        curgame.players[zero][zero].emit('go')
        collection.update({
            gamenum: numberOfgames,
        }, {
            gamenum: numberOfgames,
            players: [[id - one, one], [id, zero]],
            board: curgame.board,
        })
        console.log('Player 2 of Game#' + numberOfgames + ' connected!')
        client.emit('init', id)
        collection1.update({
            id: one,
        }, {
            id: one,
            wait: one,
            numgames: numberOfgames,
            maxcId: id,
        })
    } else {
        helperStart(clid, client, one)
    }
}

function setBoard() {
    for (let i = zero; i < sixtyfour; i++) {
        games['game' + numberOfgames].board[i] = 'U'
    }
    games['game' + numberOfgames].board[twentyseven] = 'O'
    games['game' + numberOfgames].board[twentyeight] = 'X'
    games['game' + numberOfgames].board[thrityfive] = 'X'
    games['game' + numberOfgames].board[thritysix] = 'O'
}

function checkwinner(gameno) {
    let p1 = zero
    let p2 = zero
    for (const i in games['game' + gameno].board) {
        if (games['game' + gameno].board[i] === 'X') {
            p1 = p1 + one
        } else if (games['game' + gameno].board[i] === 'O') {
            p2 = p2 + one
        }
    }
    return [p1, p2]
}

function wincheck(opp, me, gameno) {
    for (let i = zero; i < sixtyfour; i++) {
        if (games['game' + gameno].board[i] === 'U') {
            if (checkboard(i, me, opp, zero, gameno) === true) {
                return one
            }
        }
    }
    return zero
}

function boardfull(gameno) {
    for (const i in games['game' + gameno].board) {
        if (games['game' + gameno].board[i] !== 'U') {
            return zero
        }
    }
    return one
}

function checkboard(idx, me, opp, flag, gameno) {
    const c1 = execMove(idx, me, opp, flag, gameno, one, '+', zero)
    const c2 = execMove(idx, me, opp, flag, gameno, one, '-', zero)
    const c3 = execMove(idx, me, opp, flag, gameno, eight, '+', one)
    const c4 = execMove(idx, me, opp, flag, gameno, eight, '-', one)
    const c5 = execMove(idx, me, opp, flag, gameno, nine, '+', one)
    const c6 = execMove(idx, me, opp, flag, gameno, nine, '-', one)
    const c7 = execMove(idx, me, opp, flag, gameno, seven, '-', one)
    const c8 = execMove(idx, me, opp, flag, gameno, seven, '+', one)
    return c1 || c2 || c3 || c4 || c5 || c6 || c7 || c8
}


function initParams(idx, p1, bool, gameno) {
    const myarr = {}
    myarr.b = games['game' + gameno].board
    if (bool === one) {
        myarr.i = idx + p1
        myarr.diff = rowdiff(idx, idx + p1)
    } else {
        myarr.i = idx - p1
        myarr.diff = rowdiff(idx, idx - p1)
    }
    return myarr
}

function evalBoard(gameno, idx, i, me, p, op) {
    if (op === '+') {
        for (let j = idx; j < i; j = j + p) {
            games['game' + gameno].board[j] = me
        }
    } else {
        for (let j = idx; j > i; j = j - p) {
            games['game' + gameno].board[j] = me
        }
    }
}


function execMove(idx, me, opp, flag, gameno, dist, op, diff) {
    let data = getData(idx, dist, one, gameno, op)[zero]
    const cond = getData(idx, dist, one, gameno, op)[one]
    while (data.b[data.i] === opp && cond && data.diff === diff) {
        data = iterateBoard(data, op, dist)
        if (data.b[data.i] === 'U' || data.diff !== diff) {
            break
        } else if (data.b[data.i] === me && flag === zero) {
            return true
        } else if (data.b[data.i] === me) {
            evalBoard(gameno, idx, data.i, me, dist, op)
        }
    }
    return false
}

function getData(idx, dist, one, gameno, op) {
    let data = undefined
    let cond = undefined
    if (op === '+') {
        data = initParams(idx, dist, one, gameno)
        cond = data.i < sixtyfour
    } else {
        data = initParams(idx, dist, zero, gameno)
        cond = data.i >= zero
    }
    return [data, cond]
}

function iterateBoard(data, op, dist) {
    if (op === '+') {
        data.diff = rowdiff(data.i, data.i + dist)
        data.i = data.i + dist
    } else {
        data.diff = rowdiff(data.i, data.i - dist)
        data.i = data.i - dist
    }
    return data
}


function rowdiff(cell1, cell2) {
    let a = Math.ceil(cell1 / eight)
    let b = Math.ceil(cell2 / eight)
    if (cell1 % eight === zero) {
        a = a + one
    }
    if (cell2 % eight === zero) {
        b = b + one
    }
    return Math.abs(a - b)
}


const port = 8080
server.listen(port)