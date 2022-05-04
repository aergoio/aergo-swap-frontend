var $ = require('jquery');
var swal = require('sweetalert2');
var herajs = require('@herajs/client');
var aergo;
var chainId = '';
var account_address;
var balances = {};
var tokens = [];
var token_info = {};
var selecting_token = 0;
var slippage = 0.5
var showbox = false;

var token1 = 'aergo';
var token2 = '';
var min_output = BigInt(0)
var max_input  = BigInt(0)
var swap_input = 0
var swap_token1_amount = BigInt(0)
var swap_token2_amount = BigInt(0)

const swap_factory_mainnet = ""
const swap_factory_testnet = "AmhUPonrL5GgGBadrz6se86EWcejGHrojuJRL8QxgUwHBHdPT1FL"
const swap_factory_alphanet = ""
var swap_factory = swap_factory_mainnet

const waergo_mainnet = ""
const waergo_testnet = "Amhop8LbAPynYpbcMUacSVPcCsxXPHaauRhGfaCP2eV8LoBLWcyz"
const waergo_alphanet = ""
var waergo = waergo_mainnet

const multicall_mainnet = "AmhD86dERD3zdNf7spPSuE1YQaHKL6vDTErmrSZ77WZ6Gjwhixoe"
const multicall_testnet = "AmhDxQqkmLaXCRQWmU1moKKZ9hwVNA4Gg4Akra82pWuoaAFcpmnH"
const multicall_alphanet = "Amhrr8FJ8EcAZfbwdX3WBYHrDuYDpgeUswGsAsFzr83rtUjwRdpS"
var multicall = multicall_mainnet

//---------------------------------------------------------------------
// BLOCKCHAIN
//---------------------------------------------------------------------

function connect_to_aergo() {
  var url
  switch(chainId){
    case "aergo.io":         url = "mainnet-api-http.aergo.io"; break;
    case "testnet.aergo.io": url = "testnet-api-http.aergo.io"; break;
    case "alpha.aergo.io":   url = "alpha-api-http.aergo.io";   break;
  }
  url = 'https://' + url
  aergo = new herajs.AergoClient({}, new herajs.GrpcWebProvider({ url: url }))
}

/*
async function check_token_info(address, error_msg) {

  if (!token_info[address]) {
    try {
      var result = await aergo.queryContract(multicall, "aggregate",
        [address, "name"],
        [address, "symbol"],
        [address, "decimals"]
      )
      token_info[address] = {
        name: result[0],
        symbol: result[1],
        decimals: result[2]
      }
    } catch (e) {
      console.log(e)
      if (error_msg) {
        swal.fire({
          icon: 'error',
          text: error_msg
        })
      }
    }
  }

}
*/

//---------------------------------------------------------------------
// BROWSER WALLET
//---------------------------------------------------------------------

function install_extension_click() {
  var win = window.open('https://chrome.google.com/webstore/detail/aergo-connect/iopigoikekfcpcapjlkcdlokheickhpc', '_blank');
  win.focus();
  hide_box();
}

function hide_box() {
  showbox = false;
  $('#no-extension').remove();
}

function aergoConnectCall(action, responseType, data){

  showbox = true;
  setTimeout(function() {
    if (!showbox) return;

    const box = '<div id="no-extension" class="no-extension swal2-container swal2-center">' +
      '<div class="swal2-content swal2-html-container"><br>Nothing happened?</div>' +
      '<button id="install-extension" type="button" class="swal2-confirm swal2-styled" ' +
      'aria-label="">Install Aergo Connect</button></div>';

    $('body').append(box);
    $("#install-extension").click(install_extension_click);

  }, 3000);

  return new Promise((resolve, reject) => {
    window.addEventListener(responseType, function(event) {
      hide_box();
      if ('error' in event.detail) {
        reject(event.detail.error);
      } else {
        resolve(event.detail);
      }
    }, { once: true });
    window.postMessage({
      type: 'AERGO_REQUEST',
      action: action,
      data: data,
    }, '*');
  });

}

async function getActiveAccount() {
  const result = await aergoConnectCall('ACTIVE_ACCOUNT', 'AERGO_ACTIVE_ACCOUNT', {});
  chainId = result.account.chainId;
  return result.account.address;
}

async function startTxSendRequest(txdata, title, callback) {
  const result = await aergoConnectCall('SEND_TX', 'AERGO_SEND_TX_RESULT', txdata);
  console.log('AERGO_SEND_TX_RESULT', result);

/*
  swal.fire({
    title: 'Transaction sent!',
    text: 'Waiting inclusion on blockchain...',
    allowEscapeKey: false,
    allowOutsideClick: false,
    onOpen: () => {
      swal.showLoading();
    }
  })
*/

  if (!aergo) {
    connect_to_aergo()
  }

  // wait until the transaction is executed and included in a block, then get the receipt
  const receipt = await aergo.waitForTransactionReceipt(result.hash);
  console.log("receipt", receipt);

  var site = chainId.replace('aergo', 'aergoscan')
  if (site == 'aergoscan.io') site = 'mainnet.aergoscan.io'
  var url = 'https://' + site + '/transaction/' + result.hash

  if (receipt.status == "SUCCESS") {
    show_popup(title, url)
    if (callback) callback(receipt.result)
  } else {
    swal.fire({
      icon: 'error',
      title: 'Error',
      text: receipt.result
    })
    return false
  }

}

function on_chain_selected(){

  if (chainId == "testnet.aergo.io") {
    swap_factory = swap_factory_testnet
  } else if (chainId == "aergo.io") {
    swap_factory = swap_factory_mainnet
  } else if (chainId == "alpha.aergo.io") {
    swap_factory = swap_factory_alphanet
  } else {
    swal.fire({
      icon: 'error',
      text: 'This network is not yet supported'
    })
    return false
  }

  if (chainId == "aergo.io") {
    waergo = waergo_mainnet
  } else if (chainId == "testnet.aergo.io") {
    waergo = waergo_testnet
  } else {
    waergo = waergo_alphanet
  }

  if (chainId == "aergo.io") {
    multicall = multicall_mainnet
  } else if (chainId == "testnet.aergo.io") {
    multicall = multicall_testnet
  } else {
    multicall = multicall_alphanet
  }

  if (!aergo) {
    connect_to_aergo()
  }

}

//---------------------------------------------------------------------
// AMOUNT FUNCTIONS
//---------------------------------------------------------------------

function convert_typed_amount(typed, num_decimals) {
  var amount
  if(!typed || typed=='') typed = '0'
  typed = typed.replace(',', '.')
  var pos = typed.indexOf('.')
  if (pos < 0) {
    amount = typed + "0".repeat(num_decimals)
  } else {
    var num_trailing = typed.length - pos - 1
    var to_add = num_decimals - num_trailing
    typed = typed.substring(0, pos) + typed.substring(pos + 1)
    if (to_add > 0) {
      amount = typed + "0".repeat(to_add)
    } else if (to_add < 0) {
      amount = typed.substring(0, typed.length + to_add)
    } else {
      amount = typed
    }
  }
  if (amount.match(/[^0-9]/) != null) {
    return null // invalid input
  }
  amount = amount.replace(/^0+/, '') // remove leading zeros
  return amount
}

function to_decimal_str(amount, num_decimals, ntrunc) {
  if (typeof amount === "bigint") {
    amount = amount.toString()
  }
  if(ntrunc && ntrunc>0 && amount.length>ntrunc){
    amount = amount.substr(0, ntrunc) + "0".repeat(amount.length - ntrunc)
  }
  var index = amount.length - num_decimals
  if (index > 0) {
    amount = amount.substring(0, index) + "." + amount.substring(index)
  } else {
    amount = "0." + "0".repeat(-index) + amount
  }
  amount = amount.replace(/0+$/, '') // remove trailing zeros
  amount = amount.replace(/\.$/, '') // remove trailing .
/*
  if(ntrunc && ntrunc>0){
    var pos=amount.indexOf('.')
    if (pos >= 0) {
      amount = amount.substring(0, amount.length - (amount.length - pos - 1 - ntrunc))
    }
  }
*/
  return amount
}

function calculate_output(input_amount, input_reserve, output_reserve) {
  //assert(is_positive(input_reserve) and is_positive(output_reserve), "the pool is empty")
  var input_amount_with_fee = input_amount * BigInt(997)
  var numerator = input_amount_with_fee * output_reserve
  var denominator = (input_reserve * BigInt(1000)) + input_amount_with_fee
  return numerator / denominator
}

function calculate_input(output_amount, input_reserve, output_reserve) {
  //assert(is_positive(input_reserve) and is_positive(output_reserve), "the pool is empty")
  var numerator = input_reserve * output_amount * BigInt(1000)
  var denominator = (output_reserve - output_amount) * BigInt(997)
  return numerator / denominator + BigInt(1)
}

//---------------------------------------------------------------------
// UI - CONNECT WALLET
//---------------------------------------------------------------------

async function connect_wallet_click() {

  account_address = await getActiveAccount()
  if (account_address == '') account_address = null
  if (!account_address) return false

  on_chain_selected()

  on_account_connected()

  add_on_chain_changed()

  return false
}

function on_account_connected(){

  update_swap_button('Swap', true)
  update_add_button('Add New Position')
  load_user_pools(false)

  $('#connect-wallet').addClass('hidden')

  // show the account address (part)

  $('#balance').removeClass('hidden')
  $('#status-logo').removeClass('hidden')
  $('#status-logo').addClass('sm:inline-block')
  $('#status-connected').removeClass('hidden')

  var addr = account_address.substr(0,4) + "..." + account_address.substr(-4)
  $('#status-connected > div > div').html(addr)

  get_token_list()

}

async function get_account_balances(ttokens){

  if(ttokens){
    for(var i=0; i<ttokens.length; i++){
      if (ttokens[i]=='aergo') ttokens[i] = waergo
    }
    ttokens.unshift(null)
  }else{
    ttokens = tokens
  }

  var calls
/*
  calls = [
    [multicall, "getAergoBalance", account_address],
    [token11, "balanceOf", account_address],
    [token12, "balanceOf", account_address],
    [token13, "balanceOf", account_address]
  ]
*/
  calls = [
    [multicall, "getAergoBalance", account_address]
  ]

  for(var i=1; i<ttokens.length; ){

    for(var n=0; n<50 && i+n<ttokens.length; n++){
      calls.push([ttokens[i+n], "balanceOf", account_address])
    }

    try {
      var result = await aergo.queryContract(multicall, "force_aggregate", calls)
      //console.log('balances:', result)
      var n=0
      if(i==1){
        balances['aergo'] = result[0][1]
        console.log('balance aergo:', result[0][1])
        n=1
      }
      for(; n<50 && i<ttokens.length; n++, i++){
        if(result[n][0]){ // success
          balances[ttokens[i]] = result[n][1]._bignum
        }else{ // fail
          balances[ttokens[i]] = '0'
        }
        console.log('balance', ttokens[i], balances[ttokens[i]])
      }
    } catch (e) {
      console.log(e)
      if (error_msg) {
        swal.fire({
          icon: 'error',
          text: e.toString()
        })
      }
    }

    calls = []
  }


  const amtstr = to_decimal_str(balances['aergo'], 18, 6)
  document.getElementById("balance").innerHTML = amtstr + " AERGO"

  update_balances()
  add_pool_update_balances()

}

function is_aergo(token){
  return (token=='aergo' || token==waergo)
}


//---------------------------------------------------------------------
// TOKEN SELECTION
//---------------------------------------------------------------------

function request_token_list(query, callback){

  /*
  "https://api.aergoscan.io/main/token?q=(symbol:CN*)"
  "https://api.aergoscan.io/testnet/token?q=(symbol:CF*)"
  "https://api-alpha.aergoscan.io/chain/token?q=(symbol:CN*)"
  */

  var url
  if (chainId == "aergo.io") {
    url = "api.aergoscan.io/main"
  }else if (chainId == "testnet.aergo.io") {
    url = "api.aergoscan.io/testnet"
  }else{
    url = "api-alpha.aergoscan.io/chain"
  }

  //  "https://api-alpha.aergoscan.io/chain/token?size=20&from=0&sort=blockno:desc"

  // return all ARC1 tokens
  //url = "https://" + url + "/token?q=(type:ARC1)&size=100&from="
  url = "https://" + url + "/token?q=" + query + "&size=1000&sort=symbol:asc"

  // cross-domain AJAX request
  $.ajax({
    type: 'GET',
    url: url,
    dataType: 'json',
    crossDomain: true,
    success: function(list, textStatus, jqXHR) {
      // do a case insensitive sort
      list = list.hits.sort(function (a, b) {
        return a.meta.symbol.localeCompare(b.meta.symbol, 'en', {sensitivity: 'base'})
      })
      callback(list)
    },
    error: function (msg, textStatus, errorThrown) {
      console.log('error', msg)
      swal.fire({
        icon: 'error',
        //title: 'Error',
        text: 'Failed to retrieve the list of tokens'
      })
    }
  })

}

function get_token_list(){

  tokens = []
  token_info = {}

  tokens.push('aergo')
  token_info['aergo'] = {
    name: 'Aergo',
    symbol: 'AERGO',
    decimals: 18
  }

  // return all ARC1 tokens
  var query = "(type:ARC1)"

  request_token_list(query, function(list){

    //console.log(list)

    for(var i=0; i<list.length; i++){
      var item=list[i]
      var address=item.hash
      var token=item.meta

      console.log(item.hash)
      console.log(item.meta.name + ' | ' + item.meta.symbol + ' | ' + item.meta.decimals)

      if (!token_info[address]) {
        tokens.push(address)
        token_info[address] = {
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals
        }
      }
    }

    populate_token_list(tokens)

    if(account_address){
      // retrieve the account balance on different tokens
      get_account_balances()
    }

  })

}

/*
async function get_token_info(elem) {
  if (elem.value.length == 52) {
    var token_address = elem.value

    if (!aergo) {
      connect_to_aergo()
    }

    await check_token_info(token_address, 'Not able to query the token contract. Is the address correct?')

    var name = token_info[token_address].name
    var symbol = token_info[token_address].symbol
    var decimals = token_info[token_address].decimals

    if ((name && name != '') || (symbol && symbol != '')) {
      document.getElementById(elem.id + 'Name').innerHTML = 'Name: ' + name
      document.getElementById(elem.id + 'Symbol').innerHTML = 'Symbol: ' + symbol
      document.getElementById(elem.id + 'Info').style.display = 'block'
    }
  }
}

document.getElementById('token1').addEventListener('input', function() {
  get_token_info(this)
})
document.getElementById('token2').addEventListener('input', function() {
  get_token_info(this)
})
*/

$('#close-token-selector').click(function(){
  $("#token-selector").addClass('hidden')
})

$('#select-token-aergo').click(on_token_selected)
$('#select-token-gem').click(on_token_selected)

$('#select-token-gem').attr('address', 'Amh4yhGcz2A3XMVnp5fFN6gfKT7ch6cAbHwiFLVKXeqpqvpsvkqF')

function on_token_selected(){

  console.log('token click', this, this.address, this.getAttribute('address'))

  var address = this.getAttribute('address')

  if (selecting_token<=2) {
    on_token_selected_swap(address)
  }else{
    on_token_selected_add(address)
  }

  $("#token-selector").addClass('hidden')

}


//---------------------------------------------------------------------
// SWAP
//---------------------------------------------------------------------

var current_token_list = []

function select_token_click(){

  if (this.id=='select-token1') {
    selecting_token = 1
  }else if (this.id=='select-token2') {
    selecting_token = 2
  }else{
    return
  }

  $("#token-selector").removeClass('hidden')

}

$('#select-token1').click(select_token_click)
$('#select-token2').click(select_token_click)

function on_token_selected_swap(address){

  var id = '#token' + selecting_token + '-symbol'

  if(selecting_token==2 && $(id).html()=='Select a token'){
    $(id).removeClass('ml-2')
    $('#select-token2 > div > div').removeClass('hidden')
  }

  //var name = token_info[address].name
  var symbol = token_info[address].symbol
  //var decimals = token_info[address].decimals

  $(id).html(symbol)

  var img = $('#token' + selecting_token + '-img')[0]
  img.alt = symbol
  //img.src = ''
  //img.srcset = ''

  if (selecting_token==1) {
    token1 = address
  }else{
    token2 = address
  }

  update_seltoken_balances(selecting_token, address)

  $('#amount1')[0].value = ''
  $('#amount2')[0].value = ''

  swap_input = 1
  swap_token1_amount = BigInt(0)
  swap_token2_amount = BigInt(0)

  disable_router_timer()

  routes = []
  pre_routes = []
  best_route = null
  last_route_req = 0
  update_swap_price()

}

$('#swap-order').click(function(){

  var el1, el2, temp

  el1 = $('#token1-symbol')[0]
  el2 = $('#token2-symbol')[0]

  temp = el1.innerHTML
  el1.innerHTML = el2.innerHTML
  el2.innerHTML = temp

  el1 = $('#token1-img')[0]
  el2 = $('#token2-img')[0]

  temp = el1.alt
  el1.alt = el2.alt
  el2.alt = temp

  if (el1.src != el2.src) {
    temp = el1.src
    el1.src = el2.src
    el2.src = temp
  }

  if (el1.srcset != el2.srcset) {
    temp = el1.srcset
    el1.srcset = el2.srcset
    el2.srcset = temp
  }

  el1 = $('#balance1')[0]
  el2 = $('#balance2')[0]

  temp = el1.innerHTML
  el1.innerHTML = el2.innerHTML
  el2.innerHTML = temp

  $('#amount1')[0].value = ''
  $('#amount2')[0].value = ''

  temp = token1
  token1 = token2
  token2 = temp

  invert_routes()

  update_swap_info()

})

function populate_token_list(list){

  current_token_list = list
  console.log('populate_token_list', list.length)

  $('#token-list')[0].style.height = list.length * 56

  update_token_list(-1)

}

const token_item_div =
  '<div id="token-item-%n%" address="%address%" class="flex items-center w-full hover:bg-dark-800/40 px-4 py-2" style="position: absolute; left: 0px; top: %top%px; height: 56px; width: 100%;">' +
  '    <div class="flex items-center justify-between flex-grow gap-2 rounded cursor-pointer">' +
  '        <div class="flex flex-row items-center flex-grow gap-3">' +
  '            <div class="rounded-full" style="width: 32px; height: 32px;">' +
  '                <div class="overflow-hidden rounded" style="width: 32px; height: 32px;">' +
  '                   <span style="box-sizing: border-box; display: inline-block; overflow: hidden; width: 32px; height: 32px; background: none; opacity: 1; border: 0px; margin: 0px; padding: 0px; position: relative;">' +
  '                      <img alt="%symbol%" src="%logo%" decoding="async" data-nimg="fixed" class="rounded-full !rounded-full overflow-hidden" style="position: absolute; inset: 0px; box-sizing: border-box; padding: 0px; border: none; margin: auto; display: block; width: 0px; height: 0px; min-width: 100%; max-width: 100%; min-height: 100%; max-height: 100%;"></span></div>' +
  '            </div>' +
  '            <div class="flex flex-col">' +
  '                <div class="text-[0.625rem] leading-[1.2] font-medium text-secondary">%name%</div>' +
  '                <div class="text-sm leading-5 font-bold text-high-emphesis">%symbol%</div>' +
  '            </div><span></span></div>' +
  '        <div class="flex items-center">' +
  '            <div class="text-base leading-5 font-medium text-low-emphesis whitespace-nowrap overflow-hidden max-w-[5rem] overflow-ellipsis" title="0">0.00</div>' +
  '        </div>' +
  '    </div>' +
  '</div>'

function update_token_list(){

  console.log('update_token_list', current_token_list.length)

  try{

    $('#token-list > div').remove()

    var parent = $('#token-list')[0]

    for(var i=0; i<current_token_list.length; i++){

      var address = current_token_list[i]

      var html = token_item_div.replace('%top%', (i*56).toString())
      html = html.replace('%n%', i.toString())
      html = html.replace('%address%', address)
      html = html.replaceAll('%symbol%', token_info[address].symbol)
      html = html.replace('%name%', token_info[address].name)
      html = html.replace('%logo%', 'https://res.cloudinary.com/sushi-cdn/image/fetch/w_64,f_auto,q_auto,fl_sanitize/https://raw.githubusercontent.com/sushiswap/assets/master/blockchains/ethereum/assets/0x91Af0fBB28ABA7E31403Cb457106Ce79397FD4E6/logo.png')  //token_info[address].logo)

      if(balances[address] && balances[address] != '0'){
        var full_balance  = to_decimal_str(balances[address], token_info[address].decimals)
        var short_balance = to_decimal_str(balances[address], token_info[address].decimals, 6)
        html = html.replace('font-medium text-low-emphesis', 'font-bold text-high-emphesis')
        html = html.replace('title="0">0.00', 'title="' + full_balance + '">' + short_balance)
      }

      $(parent).append(html)
      $('#token-item-' + i).click(on_token_selected)

    }

  }catch(e){
    console.log(e)
  }

}

function update_balances(){

  console.log('update_balances')

  for(var i=0; i<current_token_list.length; i++){
    var address = current_token_list[i]
    //console.log('balance', address, balances[address])
    if(balances[address] && balances[address] != '0'){
      var full_balance  = to_decimal_str(balances[address], token_info[address].decimals)
      var short_balance = to_decimal_str(balances[address], token_info[address].decimals, 6)

      console.log('balance', address, short_balance, full_balance)

      var div = $('#token-list > div[address="' + address + '"] > div > div:nth-child(2) > div')
      //console.log('div', div)
      if (div.length==0) continue
      div = div[0]

      $(div).removeClass('font-medium text-low-emphesis')
      $(div).addClass('font-bold text-high-emphesis')
      $(div).attr('title', full_balance)
      $(div).html(short_balance)
    }
  }

  update_seltoken_balances(1, token1)
  update_seltoken_balances(2, token2)

}

function update_seltoken_balances(n, address){

  if(balances[address] && balances[address] != '0'){
    var balance = to_decimal_str(balances[address], token_info[address].decimals, 6)
    $('#balance' + n).html(tr('Balance:') + ' ' + balance)
  }else{
    $('#balance' + n).html(tr('Balance:') + ' 0')
  }

}

function on_balance_click(event){

  var elem = event.target
  var n = (elem.id=='balance1') ? 1 : 2

  //var balance = elem.innerHTML.substr(9)

  var token = (n==1) ? token1 : token2

  var balance = to_decimal_str(balances[token], token_info[token].decimals, 0)

  if(n==1){
    $('#amount1')[0].value = balance
    on_input1()
  }else{
    $('#amount2')[0].value = balance
    on_input2()
  }

}
$('#balance1').click(on_balance_click)
$('#balance2').click(on_balance_click)

/*
function update_token_list(scroll_top){

  const max_items = 8

  if(scroll_top<0){
    scroll_top = $('#token-list-parent')[0].scrollTop
  }

  //xx
  //var top = 000
  var pos = parseInt(scroll_top / 56)
  if (pos>0) pos -= 1

  //for(var i=0; i<list.length; i++){

  for(var i=0; i<max_items && pos<current_token_list.length; i++){

    var parent = $('#token-item-' + i)[0]
    parent.style.top = (pos * 56) + 'px'

    parent = $(parent).find("div > div > div")
    var img = $(parent[0]).find("div > span > img")[0]
    var div = $(parent[1]).find("div > div")

    var address = current_token_list[pos]

    img.alt = token_info[address].symbol
    img.src = ''
    img.srcset = ''

    div[0].innerHTML = token_info[address].name
    div[1].innerHTML = token_info[address].symbol

    pos += 1
  }

}

$('#token-list')[0].onscroll = function(){
  console.log('child', this.scrollTop)
}

$('#token-list-parent')[0].onscroll = function(){
  console.log('parent', this.scrollTop)
}
*/

function on_token_search_input(event){

  var elem = event.target

  if (elem.value.length == 0) {
    populate_token_list(tokens)
    return
  }

  var typed = elem.value.toUpperCase()

  var result = tokens.filter(function(address){
    var token = token_info[address]
    return token.symbol.toUpperCase().indexOf(typed)>=0 ||
             token.name.toUpperCase().indexOf(typed)>=0
  })

  if (result.length==0) {
    // search by token address
    //result = tokens.filter(address => address.toUpperCase()==typed)
    typed = elem.value
    result = tokens.filter(address => address==typed)
  }

  populate_token_list(result)

}

var input = document.getElementById('token-search-input')
input.addEventListener('input', on_token_search_input)
input.addEventListener('keydown', function(event) {
  const key = event.key
  if (key === "Backspace" || key === "Delete") {
    on_token_search_input(event)
  }
})


//---------------------------------------------------------------------
// TOKEN PRICES
//---------------------------------------------------------------------

function xx(){


// can it be computed instead of retrieving price data for all?
// if we have the price of just AERGO and GEM, it may be enough for most use cases (at start)



  $("#equiv-amount1").html('~$93.10 ')
  $("#equiv-amount2").html('~$93.32 <span class="text-low-emphesis">(0.3%)</span>')



}

//---------------------------------------------------------------------
// SWAP RATES
//---------------------------------------------------------------------




//---------------------------------------------------------------------
// INPUT AND OUTPUT AMOUNTS
//---------------------------------------------------------------------

// when using a path we must to do this for each step/hop in the path

function no_routes(){
  if(is_aergo(token1) && is_aergo(token2)){
    return false
  }
  return (routes.length==0 && last_route_req>0)
}

function update_swap_button(text, enabled){
  if(!account_address){
    return
  }
  var button = document.getElementById("main-button")
  button.innerHTML = text
  button.disabled = !enabled
}

function on_input1(){

  swap_input = 1
  swap_token1_amount = BigInt(0)
  swap_token2_amount = BigInt(0)

  var typed_amount = document.getElementById('amount1').value

  if (typed_amount.length == 0) {
    document.getElementById('amount2').value = ''
    hide_swap_info()
    return
  }

  var decimals1 = token_info[token1].decimals

  var token1_amount = convert_typed_amount(typed_amount, decimals1)
  if (!token1_amount) return;
  swap_token1_amount = BigInt(token1_amount)

  update_swap_price()

}

function on_input2(){

  swap_input = 2
  swap_token1_amount = BigInt(0)
  swap_token2_amount = BigInt(0)

  var typed_amount = document.getElementById('amount2').value

  if (typed_amount.length == 0) {
    document.getElementById('amount1').value = ''
    hide_swap_info()
    return
  }

  var decimals2 = token_info[token2].decimals

  var token2_amount = convert_typed_amount(typed_amount, decimals2)
  if (!token2_amount) return;
  swap_token2_amount = BigInt(token2_amount)

  update_swap_price()

}

function show_swap_price(){

  var decimals1 = token_info[token1].decimals
  var decimals2 = token_info[token2].decimals

  if (swap_input==1) {

    if (swap_token2_amount <= 0) {
      document.getElementById('amount2').value = ''
      update_swap_button('Insufficient liquidity', false)
      hide_swap_info()
      return
    }

    document.getElementById('amount2').value =
      to_decimal_str(swap_token2_amount, decimals2)

  }else{

    if (swap_token1_amount <= 0) {
      document.getElementById('amount1').value = ''
      update_swap_button('Insufficient liquidity', false)
      hide_swap_info()
      return
    }

    document.getElementById('amount1').value =
      to_decimal_str(swap_token1_amount, decimals1);

  }

  update_swap_button('Swap', true)
  show_swap_info()

}

var input = document.getElementById('amount1')
input.addEventListener('input', on_input1)
input.addEventListener('keydown', function(event) {
  const key = event.key
  if (key === "Backspace" || key === "Delete") {
    on_input1(event)
  }
})

var input = document.getElementById('amount2')
input.addEventListener('input', on_input2)
input.addEventListener('keydown', function(event) {
  const key = event.key
  if (key === "Backspace" || key === "Delete") {
    on_input2(event)
  }
})

function hide_swap_info(){
  $('#swap-info').addClass('hidden')
}

function show_swap_info(){

  update_swap_info()

  $('#swap-info').removeClass('hidden')

}

$('#view-swap-details').click(function(){

  if ($('#swap-details').hasClass('hidden')) {
    $('#swap-info > div').addClass('bg-dark-900')
    $('#swap-details').removeClass('hidden')
    $('#view-swap-details > svg').addClass('rotate-180')
  }else{
    $('#swap-info > div').removeClass('bg-dark-900')
    $('#swap-details').addClass('hidden')
    $('#view-swap-details > svg').removeClass('rotate-180')
  }

})

$('#confirm-swap-view-details').click(function(){

  if ($('#confirm-swap-details').hasClass('hidden')) {
    $('#confirm-swap-view-details > svg').addClass('rotate-180')
    $('#confirm-swap-details').removeClass('hidden')
  }else{
    $('#confirm-swap-view-details > svg').removeClass('rotate-180')
    $('#confirm-swap-details').addClass('hidden')
  }

})

var swap_info = { direction: 0 }

function invert_rate(){
  swap_info.direction = (swap_info.direction + 1) % 2
  update_swap_info()
}
$('#swap-invert-rate').click(invert_rate)
$('#confirm-swap-invert-rate').click(invert_rate)

function update_swap_info(){

  if(is_aergo(token1) && is_aergo(token2)){
    update_swap_info_aergo()
    return
  }

  // compute the values

  var decimals1 = token_info[token1].decimals
  var decimals2 = token_info[token2].decimals

  var token11 = (token1=='aergo') ? waergo : token1
  var token22 = (token2=='aergo') ? waergo : token2

  var token1_amount = swap_token1_amount
  var token2_amount = swap_token2_amount

  if(swap_info.direction==0){
    var multiplier = BigInt(10) ** BigInt(decimals1)
    //var amount = pair.reserves[token22] * multiplier / pair.reserves[token11]
    var amount = token2_amount * multiplier / token1_amount
    swap_info.rate_amount = to_decimal_str(amount, decimals2)
  }else{
    var multiplier = BigInt(10) ** BigInt(decimals2)
    //var amount = pair.reserves[token11] * multiplier / pair.reserves[token22]
    var amount = token1_amount * multiplier / token2_amount
    swap_info.rate_amount = to_decimal_str(amount, decimals1)
  }

  // calculate price impact
  //var normal_output = token1_amount * pair.reserves[token22] / pair.reserves[token11]
  var normal_output
  if (best_route!=null) {
    var token_amount = token1_amount
    var tokenA = token11
    for (pair of best_route) {
      var tokenB = pair.other_token[tokenA]
      token_amount = token_amount * pair.reserves[tokenB] / pair.reserves[tokenA]
      tokenA = tokenB
    }
    normal_output = token_amount
  }else{
    normal_output = token2_amount
  }
  if (normal_output==0) normal_output = 1  // to avoid division by zero
  swap_info.price_impact = Number((normal_output - token2_amount) * BigInt(10000) / normal_output) / 100.0

/*
//  var multiplier = BigInt(10) ** BigInt(decimals1)
//  var token2_amount = pair.reserves[token22] * multiplier * BigInt(token1_amount) / pair.reserves[token11]
  var token2_amount = pair.reserves[token22] * BigInt(token1_amount) / pair.reserves[token11]
  var min_output = token2_amount * BigInt((100 - slippage) * 100) / BigInt(10000)
  min_output = to_decimal_str(min_output, decimals2, 6)
*/

  if( swap_input==1 ){
    min_output = token2_amount * BigInt((100 - slippage) * 100) / BigInt(10000)
    swap_info.min_output_str = to_decimal_str(min_output, decimals2, 6)
  }else if( swap_input==2 ){
    max_input = token1_amount * BigInt((100 + slippage) * 100) / BigInt(10000)
    swap_info.max_input_str = to_decimal_str(max_input, decimals1, 6)
  }

  swap_info.fee = 0.0
  swap_info.route = token_info[token1].symbol
  if (best_route!=null) {
    var token = token11
    for (pair of best_route) {
      token = pair.other_token[token]
      //var symbol = token_info[token] ? token_info[token].symbol : '?'
      swap_info.route += ' &gt; ' + token_info[token].symbol
      swap_info.fee += 0.3
    }
  }else{
    swap_info.route = '...'
  }



  // transform them into string

  // '1 SUSHI <span class="text-primary">=</span> 0.001148 ETH <span class="text-xs leading-4 font-medium text-secondary">($3.57139)</span>'
  var rate = '1 %1 <span class="text-primary">=</span> %2 %3 <span class="text-xs leading-4 font-medium text-secondary">%4</span>'

  if(swap_info.direction==0){
    rate = rate.replace('%1', token_info[token1].symbol)
    rate = rate.replace('%3', token_info[token2].symbol)
    rate = rate.replace('%2', swap_info.rate_amount)
    rate = rate.replace('%4', '')
  }else{
    rate = rate.replace('%1', token_info[token2].symbol)
    rate = rate.replace('%3', token_info[token1].symbol)
    rate = rate.replace('%2', swap_info.rate_amount)
    rate = rate.replace('%4', '')
  }

  swap_info.rate = rate

  swap_info.fee = swap_info.fee.toFixed(2) + '%'

  swap_info.price_impact = swap_info.price_impact.toFixed(2) + '%'

  if( swap_input==1 ){
    swap_info.expected_title = tr('Expected Output')
    swap_info.expected_amount = document.getElementById('amount2').value + ' ' + token_info[token2].symbol
  }else if( swap_input==2 ){
    swap_info.expected_title = tr('Expected Input')
    swap_info.expected_amount = document.getElementById('amount1').value + ' ' + token_info[token1].symbol
  }

  if( swap_input==1 ){
    swap_info.minimum_title = tr('Minimum received after slippage') + ' (' + slippage.toFixed(2) + '%)'
    swap_info.minimum_amount = swap_info.min_output_str + ' ' + token_info[token2].symbol
  }else if( swap_input==2 ){
    swap_info.minimum_title = tr('Maximum spent after slippage') + ' (' + slippage.toFixed(2) + '%)'
    swap_info.minimum_amount = swap_info.max_input_str + ' ' + token_info[token1].symbol
  }


  // update both dialogs
  update_swap_info_dialog('#si')
  update_swap_info_dialog('#confirm-swap')


  var html, amount
  if( swap_input==1 ){
    amount = swap_info.min_output_str + ' ' + token_info[token2].symbol
    html = tr('Output is estimated. You will receive at least')
  }else if( swap_input==2 ){
    amount = swap_info.max_input_str + ' ' + token_info[token1].symbol
    html = tr('Input is estimated. You will sell at most')
  }
  html += ` <span class="text-xs leading-4 font-bold text-high-emphesis">${amount}</span> ${tr('or the transaction will revert.')}`
  $('#confirm-swap-message').html(html)

}

function update_swap_info_dialog(prefix){

  $(prefix + '-rate'  ).html(swap_info.rate)
  $(prefix + '-route' ).html(swap_info.route)
  $(prefix + '-fee'   ).html(swap_info.fee)
  $(prefix + '-impact').html(swap_info.price_impact)

  var div = $(prefix + '-expected > div')
  div[0].innerHTML = swap_info.expected_title
  div[1].innerHTML = swap_info.expected_amount

  var div = $(prefix + '-minimum > div')
  div[0].innerHTML = swap_info.minimum_title
  div[1].innerHTML = swap_info.minimum_amount

}

function update_swap_info_aergo(){

  // '1 SUSHI <span class="text-primary">=</span> 0.001148 ETH <span class="text-xs leading-4 font-medium text-secondary">($3.57139)</span>'
  var rate = '1 %1 <span class="text-primary">=</span> %2 %3 <span class="text-xs leading-4 font-medium text-secondary">%4</span>'

  if(swap_info.direction==0){
    rate = rate.replace('%1', token_info[token1].symbol)
    rate = rate.replace('%3', token_info[token2].symbol)
  }else{
    rate = rate.replace('%1', token_info[token2].symbol)
    rate = rate.replace('%3', token_info[token1].symbol)
  }
  rate = rate.replace('%2', '1')
  rate = rate.replace('%4', '')  //! amount in USD/EUR/KRW/...

  swap_info.rate = rate

  swap_info.route = token_info[token1].symbol + ' &gt; ' + token_info[token2].symbol

  swap_info.fee = '0%'
  swap_info.price_impact = '0%'

  swap_info.expected_title = 'Exact Output'
  swap_info.expected_amount = document.getElementById('amount2').value + ' ' + token_info[token2].symbol

  swap_info.minimum_title  = 'Minimum received'
  swap_info.minimum_amount = document.getElementById('amount2').value + ' ' + token_info[token2].symbol

  // update both dialogs
  update_swap_info_dialog('#si')
  update_swap_info_dialog('#confirm-swap')

}


//---------------------------------------------------------------------
// SWAP
//---------------------------------------------------------------------

function swap_click(){

  if(!account_address){
    connect_wallet_click()
    return
  }

  // display the confirm swap dialog

  $('#confirm-swap-amount1').html(to_decimal_str(swap_token1_amount, token_info[token1].decimals, 6))
  $('#confirm-swap-amount2').html(to_decimal_str(swap_token2_amount, token_info[token2].decimals, 6))

  $('#confirm-swap-symbol1').html(token_info[token1].symbol)
  $('#confirm-swap-symbol2').html(token_info[token2].symbol)

  confirm_swap_set_icon('#confirm-swap-logo1', 1)
  confirm_swap_set_icon('#confirm-swap-logo2', 2)

  $('#confirm-swap').removeClass('hidden')

}

function confirm_swap_set_icon(parent, n){

  var imgsrc = 'https://res.cloudinary.com/sushi-cdn/image/fetch/w_64,f_auto,q_auto,fl_sanitize/https://raw.githubusercontent.com/sushiswap/assets/master/blockchains/ethereum/assets/0x91Af0fBB28ABA7E31403Cb457106Ce79397FD4E6/logo.png'

  var img = $(parent + ' > span > img')[0]
  img.src = imgsrc
  img.srcset = imgsrc + ' 1x, ' + imgsrc + ' 2x'
}

$('#close-confirm-swap').click(function(){
  $("#confirm-swap").addClass('hidden')
})

$('#confirm-swap-button').click(function(){

  if(is_aergo(token1) && is_aergo(token2)){
    process_aergo()
    return
  }

  if( best_route==null || best_route.length==0 ){
    console.log('swap: no current route')
    return
  }

  var token_amount = swap_token1_amount.toString()

  // options

  var args = {}

  if( swap_input==1 ){
    args.min_output = min_output.toString()
  }else if( swap_input==2 ){
    args.exact_output = swap_token2_amount.toString()
  }else{
    return  //!
  }

  var pair_address = best_route[0].address

  if( best_route.length > 1 ){
    var path = []
    for (step in best_route) {
      path.push(step.address)
    }
    path.push(account_address)
    args.path = path
  }

  // prepare and send the transaction

  var txdata

  if (token1=='aergo') {

    if( swap_input==2 ){
      token_amount = max_input
    }

    txdata = {
      type: 5,  // CALL
      from: account_address,
      to: waergo,
      amount: token_amount + ' aer',
      payload_json: {
        Name: "wrap_to",
        Args: [pair_address, "swap", args]
      }
    }

  }else{

    if( swap_input==2 ){
      token_amount = max_input.toString()
    }
    if (token2=='aergo') {
      args['unwrap_aergo'] = true
    }

    txdata = {
      type: 5,  // CALL
      from: account_address,
      to: token1,
      amount: 0,
      payload_json: {
        Name: "transfer",
        Args: [pair_address, token_amount, "swap", args]
      }
    }

  }

  var title = tr('Swap {0} {1} by {2} {3}',
    $('#confirm-swap-amount1').html(),
    token_info[token1].symbol,
    $('#confirm-swap-amount2').html(),
    token_info[token2].symbol
  )

  startTxSendRequest(txdata, title, function(result){

    $('#amount1')[0].value = ''
    $('#amount2')[0].value = ''

    swap_input = 1
    swap_token1_amount = BigInt(0)
    swap_token2_amount = BigInt(0)

    update_routes()
    get_account_balances([token1, token2])

  })

})

function process_aergo(){

  var token_amount = swap_token1_amount.toString()

  var txdata

  if (token1=='aergo' && token2==waergo) {  // wrap

    txdata = {
      type: 5,  // CALL
      from: account_address,
      to: waergo,
      amount: token_amount + ' aer',
      payload_json: {
        Name: "wrap",
        Args: []
      }
    }

  }else if (token1==waergo && token2=='aergo') {  // unwrap

    txdata = {
      type: 5,  // CALL
      from: account_address,
      to: waergo,
      amount: 0,
      payload_json: {
        Name: "unwrap",
        Args: [token_amount]
      }
    }

  }else{
    return
  }

  var title = tr('Swap {0} {1} by {2} {3}',
    $('#confirm-swap-amount1').html(),
    token_info[token1].symbol,
    $('#confirm-swap-amount2').html(),
    token_info[token2].symbol
  )

  startTxSendRequest(txdata, title, function(result){

    $('#amount1')[0].value = ''
    $('#amount2')[0].value = ''

    swap_input = 1
    swap_token1_amount = BigInt(0)
    swap_token2_amount = BigInt(0)

    get_account_balances([waergo])

  })

}


//---------------------------------------------------------------------
// CLOSE MODALS
//---------------------------------------------------------------------

var modal_close

$('html').click(function() {
  // hide menus and windows if visible
  if (modal_close) {
    modal_close()
    modal_close = null
  }
})


//---------------------------------------------------------------------
// CONFIG
//---------------------------------------------------------------------

$('#show-config').click(function(event){
  $('#popover-portal').removeClass('hidden')
  modal_close = function(){
    $('#popover-portal').addClass('hidden')
  }
  event.stopPropagation()
})

$('#popover-portal').click(function(event){
  event.stopPropagation()
})

function on_slippage_change(event){
  slippage = parseFloat(event.target.value)
  if (!slippage || slippage < 0) slippage = 0.0
  if (slippage > 100) slippage = 100.0
  update_swap_info()
}

var input = document.getElementById('config-slippage')
input.addEventListener('input', on_slippage_change)
input.addEventListener('keydown', function(event) {
  const key = event.key
  if (key === "Backspace" || key === "Delete") {
    on_slippage_change(event)
  }
})


//---------------------------------------------------------------------
// POPUP MESSAGE
//---------------------------------------------------------------------

function show_popup(title, url){

  $('#popup-message-title').html(title)
  $('#popup-message-link').html(url)

  $('#popup-message').removeClass('hidden')

  setTimeout(function(){
    $('#popup-message').addClass('hidden')
  }, 5000)

}

$('#close-popup-message').click(function(){
  $("#popup-message").addClass('hidden')
})


//---------------------------------------------------------------------
// MENU
//---------------------------------------------------------------------

var current_page = 'swap-page'

function show_page(name){
  if (name==current_page) return
  $('#' + current_page).addClass('hidden')
  current_page = name
  $('#' + current_page).removeClass('hidden')
}

$('#show-swap-page').click(function(){
  disable_pool_list_timer()
  show_page('swap-page')
  enable_router_timer()
})

$('#show-pool-page').click(function(){
  disable_router_timer()
  load_user_pools(false)
  show_page('pool-page')
  enable_pool_list_timer()
})

$('a.go-back').click(function(){
  show_page('pool-page')
})


//---------------------------------------------------------------------
// LIQUIDITY POOLS
//---------------------------------------------------------------------

var current_pool_list = []

function on_pool_list_item_click(){

  var div = $(this).parent().find('> div')

  if (div.hasClass('hidden')) {
    div.removeClass('hidden')
    $(this).find('div:nth-child(2) > svg > path').attr('d','M5 15l7-7 7 7')
  } else {
    div.addClass('hidden')
    $(this).find('div:nth-child(2) > svg > path').attr('d','M19 9l-7 7-7-7')
  }

}

function update_pool_list(){

  console.log('update_pool_list', current_pool_list.length)

  try{

    var parent = $('#pool-list')[0]

    if (current_pool_list.length==0) {
      $(parent).find('> div > div').html('No liquidity was found')
      return
    }

    $(parent).find('> div').remove()

    var item_template = $('#pool-item').html()

    for(var i=0; i<current_pool_list.length; i++){

      var pool = current_pool_list[i]

      if (!token_info[pool.token1] || !token_info[pool.token2]) continue

      var symbol1 = (pool.token1==waergo) ? 'AERGO' : token_info[pool.token1].symbol
      var symbol2 = (pool.token2==waergo) ? 'AERGO' : token_info[pool.token2].symbol

      var html = item_template
      html = html.replaceAll('%pair%', i.toString())
      html = html.replaceAll('%symbol1%', symbol1)
      html = html.replaceAll('%symbol2%', symbol2)
      html = html.replaceAll('%img1%', 'https://res.cloudinary.com/sushi-cdn/image/fetch/w_64,f_auto,q_auto,fl_sanitize/https://raw.githubusercontent.com/sushiswap/assets/master/blockchains/ethereum/assets/0x91Af0fBB28ABA7E31403Cb457106Ce79397FD4E6/logo.png')  //token_info[address].logo)
      html = html.replaceAll('%img2%', 'https://res.cloudinary.com/sushi-cdn/image/fetch/w_64,f_auto,q_auto,fl_sanitize/https://raw.githubusercontent.com/sushiswap/assets/master/blockchains/ethereum/assets/0x91Af0fBB28ABA7E31403Cb457106Ce79397FD4E6/logo.png')  //token_info[address].logo)

      //var lptoken_amount = to_decimal_str(pool.lptoken_amount, token_info[pool.lptoken].decimals, 6)
      var lptoken_amount = to_decimal_str(pool.lptoken_amount, 18, 6)
      var token1_amount = to_decimal_str(pool.token1_amount, token_info[pool.token1].decimals, 6)
      var token2_amount = to_decimal_str(pool.token2_amount, token_info[pool.token2].decimals, 6)
      html = html.replace('%lptoken_amount%', lptoken_amount)
      html = html.replace('%token1_amount%', token1_amount)
      html = html.replace('%token2_amount%', token2_amount)
      html = html.replace('%pool_share%', pool.share.toFixed(2) + '%')

      $(parent).append(html)

      var buttons = $('#pool-item-' + i + ' > div > div > div:nth-child(2) > button')
      buttons[0].onclick = on_add_liquidity_click
      buttons[1].onclick = on_remove_liquidity_click

    }

    // after all items are added/updated
    var items = $('#pool-list > div > button')
    items.off('click')
    items.click(on_pool_list_item_click)

  }catch(e){
    console.log(e)
  }

}

var last_account_address = 'none'

function load_user_pools(force){

  // only reload if from different address or if added/removed liquidity
  if(account_address==last_account_address && !force) return
  last_account_address = account_address

  var parent = $('#pool-list')[0]

  $(parent).find('> div').remove()

  var content = $('#pool-text').html()
  $(parent).append(content)

  current_pool_list = []
  get_user_pools(1)

}

function get_user_pools(first){

  if(!account_address){
    update_pool_list()
    return
  }

  console.log("get_user_pools", account_address, first)

  try {

    aergo.queryContract(
      swap_factory, "get_account_liquidity", account_address, first
    ).then(function(result){

      console.log('load_user_pools:', result)
      var is_last = result[0]
      var list = result[1]

      if(Array.isArray(list)){
        current_pool_list.push(...list)
      }

      if(!is_last){
        get_user_pools(first + 200)
      }else{

        for(var i=0; i<current_pool_list.length; i++){
          var item = current_pool_list[i]

          var share_num = BigInt(item[7])  // lptoken_amount
          var share_den = BigInt(item[6]) - BigInt(1000)  // lptoken_supply

          current_pool_list[i] = {

            pair: item[0],
            token1: item[1],
            token2: item[2],
            lptoken: item[3],

            lptoken_supply: share_den.toString(),  // item[6],
            lptoken_amount: item[7],
            share_num: share_num,
            share_den: share_den,
            share: parseFloat(share_num * BigInt(10000) / share_den) / 100,

            token1_total_amount: item[4],
            token2_total_amount: item[5],

            token1_amount: (BigInt(item[4]) * share_num / share_den).toString(),
            token2_amount: (BigInt(item[5]) * share_num / share_den).toString()

          }

          var pair_address = item[0]
          item.shift()
          update_pair_info(pair_address, item)
        }

        update_pool_list()
      }

    }, function(error){
      console.log(error)
      swal.fire({
        icon: 'error',
        text: error
      })
    })

  } catch (e) {
    console.log(e)
    swal.fire({
      icon: 'error',
      text: e
    })
  }

}

var pool_list_timer = null

function enable_pool_list_timer(){
  if(pool_list_timer==null && current_pool_list.length > 0){
    pool_list_timer = setInterval(update_user_pools, 30 * 1000) // 30 seconds
  }
}

function disable_pool_list_timer(){
  if(pool_list_timer!=null){
    clearInterval(pool_list_timer)
    pool_list_timer = null
  }
}

async function update_user_pools(){

  return  //!  update_pool_list() will add items to the list

  var calls = []

  for(var i=0; i<current_pool_list.length; i++){
    var pool = current_pool_list[i]
    calls.push([pool.pair, "get_pool_info", account_address])
  }

  try {
    var results = await aergo.queryContract(multicall, "aggregate", calls)

    console.log('update_user_pools:', results)

    var n = 0
    for (call of calls) {
      var pair_address = call[0]
      var result = results[n]

      update_pair_info(pair_address, result)

      for(var i=0; i<current_pool_list.length; i++){
        var pool = current_pool_list[i]
        if (pool.pair==pair_address) {
          pool.token1_total_amount = result[3]
          pool.token2_total_amount = result[4]
          pool.token1_amount = (BigInt(pool.token1_total_amount) * pool.share_num / pool.share_den).toString()
          pool.token2_amount = (BigInt(pool.token2_total_amount) * pool.share_num / pool.share_den).toString()
        }
      }

      n += 1
    }

    update_pool_list()

  } catch (e) {
    console.log(e)
    swal.fire({
      icon: 'error',
      text: e.toString()
    })
  }

}


//---------------------------------------------------------------------
// LIQUIDITY PAIRS
//---------------------------------------------------------------------

var pair_info = {}

function find_pair(token1, token2){
  for(var address in pair_info){
    var pair = pair_info[address]
    if( (pair.token1==token1 && pair.token2==token2) ||
        (pair.token1==token2 && pair.token2==token1) ){
      return address
    }
  }
  return null
}

function get_pair_info(token1, token2, callback){

  console.log('get_pair_info', token1, token2)

  if(is_aergo(token1) && is_aergo(token2)){
    return
  }

  if (token1=='aergo') token1 = waergo
  if (token2=='aergo') token2 = waergo

  var pair_address = find_pair(token1, token2)
  if (pair_address && pair_address != '') {
    console.log('get_pair_info - found pair')
    if (callback) callback(pair_address)
    return
  }

  try {
    //var result = await aergo.queryContract(swap_factory, "get_pair_info", token1, token2)
    aergo.queryContract(
      swap_factory, "get_pair_info", token1, token2
    ).then(function(result){

      console.log('get_pair_info - contract returned:', result)

      if (result==null) {
        if (callback) callback('')
        return
      }

      var pair_address = result[0]
      result.shift()
      update_pair_info(pair_address, result)

      if (callback) callback(pair_address)
    })

  } catch (e) {
    console.log(e)
    swal.fire({
      icon: 'error',
      text: e
    })
  }

}

// update the pair_info object without replacing it. so other
// variables that point to the object are updated
function update_pair_info(pair_address, result){

  var info = pair_info[pair_address] || {}

  info.address = pair_address
  info.token1 = result[0]
  info.token2 = result[1]
  info.lptoken = result[2]
  info.token1_amount = result[3]
  info.token2_amount = result[4]
  info.lptoken_amount = result[5]
  info.reserves = {}
  info.reserves[info.token1] = BigInt(info.token1_amount)
  info.reserves[info.token2] = BigInt(info.token2_amount)
  info.other_token = {}
  info.other_token[info.token1] = info.token2
  info.other_token[info.token2] = info.token1

  if (!pair_info[pair_address]) {
    pair_info[pair_address] = info
  }

  return info
}


//---------------------------------------------------------------------
// ROUTING
//---------------------------------------------------------------------

var routes = []
var pre_routes = []
var best_route = null

var last_route_req = 0   // reset when token is selected

/*

with multicall:
list all pairs from token1
list all pairs from token2
check if a direct pair exists
  if exists, add it to the list of routes
check tokens in common (in a loop)
  add them to the list of routes

repeat, peaking one token at a time from the left

compute the output amount for each route / path
get the one with best output (or compute input if giving output)

*/

// maybe request the pair_info in the same (2nd) multicall, or at the same time on a separate request

function find_routes(){

  last_route_req += 1
  let current_route_req = last_route_req  // use let here

  console.log('find_routes', token1, token2)

  routes = []
  pre_routes = []

  var tokenA = (token1=='aergo') ? waergo : token1
  var tokenB = (token2=='aergo') ? waergo : token2

  var calls = [
    [swap_factory, "get_pairs_with_token", tokenA],
    [swap_factory, "get_pairs_with_token", tokenB]
  ]

  try {
    aergo.queryContract(multicall, "aggregate", calls).then(function(results){

      console.log('find_routes result:', results)

      if (current_route_req != last_route_req) return

      var pairs_with_A = results[0]
      var pairs_with_B = results[1]

      var tokens_with_A = Object.keys(pairs_with_A)
      var tokens_with_B = Object.keys(pairs_with_B)

      // check for direct route
      if (tokens_with_B.includes(tokenA)) {
        pre_routes.push([
          [tokenA, tokenB, pairs_with_A[tokenB]]
        ])
        // remove already used path
        tokens_with_A.splice(tokens_with_A.indexOf(tokenB), 1)
        tokens_with_B.splice(tokens_with_B.indexOf(tokenA), 1)
      }

      // check for routes with common tokens
      var common_tokens = tokens_with_A.filter(value => tokens_with_B.includes(value))

      for (token of common_tokens) {
        pre_routes.push([
          [tokenA, token, pairs_with_A[token]],
          [token, tokenB, pairs_with_B[token]]
        ])
      }

      console.log('find_routes - pre_routes:', pre_routes)

      // check for paths with 3 hops

      calls = []
      for (token of tokens_with_A) {
        //if (token!=tokenA && token!=tokenB && !tokens_with_B.includes(token)) {
        if (token!=tokenA && token!=tokenB) {
          calls.push([swap_factory, "get_pairs_with_token", token])
        }
      }
      if (calls.length > 0) {
        console.log('find_routes - calls2:', calls)
        aergo.queryContract(multicall, "aggregate", calls).then(function(results){

          console.log('find_routes result2:', results)

          if (current_route_req != last_route_req) return

          var n = 0
          for (tokenC of tokens_with_A) {
            if (tokenC==tokenA || tokenC==tokenB) continue;
            var pairs_with_C = results[n]
            var tokens_with_C = Object.keys(pairs_with_C)

            var common_tokens = tokens_with_C.filter(value => tokens_with_B.includes(value))
            for (tokenD of common_tokens) {
              pre_routes.push([
                [tokenA, tokenC, pairs_with_A[tokenC]],
                [tokenC, tokenD, pairs_with_C[tokenD]],
                [tokenD, tokenB, pairs_with_B[tokenD]]
              ])
            }
            n += 1
          }

          get_routes_info()
        })

      }else{
        get_routes_info()
      }

    })

  } catch (e) {
    console.log(e)
    if (error_msg) {
      swal.fire({
        icon: 'error',
        text: e.toString()
      })
    }
  }

}

// retrieve pair_info for each swap pair in all routes
// store them in pair_info, and create a link to them in the routes array
function get_routes_info(){

  console.log('get_routes_info - pre_routes:', pre_routes)

  if (pre_routes.length == 0) return

  let current_route_req = last_route_req  // use let here

  // subscribe to events on all pairs from all possible routes (?)
  //subscribe_to_pairs()

  //! can all the calls the done in a single multicall?

  // get unique pairs
  var pairs = new Set()
  for (pre_route of pre_routes) {
    for (step of pre_route) {
      console.log('get_routes_info - step:', step)
      var pair_address = step[2]
      pairs.add(pair_address)
    }
  }
  var calls = []
  for (pair of pairs) {
    console.log('get_routes_info - pair:', pair)
    calls.push([pair, "get_pool_info"])
  }

  console.log('get_routes_info - for', calls.length, 'pairs - calls:', calls)

  aergo.queryContract(multicall, "aggregate", calls).then(function(results){

    console.log('get_routes_info results:', results)

    var n = 0
    for (call of calls) {
      var pair_address = call[0]
      update_pair_info(pair_address, results[n])
      n += 1
    }

    if (current_route_req != last_route_req) return

    for (pre_route of pre_routes) {
      var new_route = []
      for (step of pre_route) {
        var address = find_pair(step[0], step[1])
        new_route.push(pair_info[address])
      }
      routes.push(new_route)
    }

// select best route based in input or exact output
// subscribe to events on all pairs from the selected route - or all possible routes - or just use a timer
// also called with input amount is changed, and when pair is updated (event or timer)
    update_swap_price()

    enable_router_timer()
  })

}

function update_swap_price(){

  console.log('update_swap_price - routes:', routes.length)

  if(routes.length==0 && last_route_req==0){
    find_routes()
    return
  }

  if (swap_input==1) {
    update_output_price()
  } else {
    update_input_price()
  }

  show_swap_price()
}

function update_output_price(){

  if(is_aergo(token1) && is_aergo(token2)){
    swap_token2_amount = swap_token1_amount
    return
  }
  if (swap_token1_amount==0) {
    swap_token2_amount = 0
    return
  }

  // select the best route

  var first_token = (token1=='aergo') ? waergo : token1
  var last_token  = (token2=='aergo') ? waergo : token2

  for (route of routes) {
    var tokenA = first_token
    var amount = swap_token1_amount
    var path = token_info[tokenA].symbol
    for (pair of route) {
      var tokenB = pair.other_token[tokenA]
      var amountB = calculate_output(amount, pair.reserves[tokenA], pair.reserves[tokenB])
      console.log('reserves:',
        to_decimal_str(pair.reserves[tokenA], token_info[tokenA].decimals, 6), token_info[tokenA].symbol,
        to_decimal_str(pair.reserves[tokenB], token_info[tokenB].decimals, 6), token_info[tokenB].symbol)
      console.log(
        to_decimal_str(amount,  token_info[tokenA].decimals, 6), token_info[tokenA].symbol, '->',
        to_decimal_str(amountB, token_info[tokenB].decimals, 6), token_info[tokenB].symbol)
      amount = amountB
      path += ' > ' + token_info[tokenB].symbol
      tokenA = tokenB
    }
    console.log(amount, '-', path)
    if (tokenA!=last_token) amount = BigInt(0)
    route.path = path
    route.output_amount = amount
  }

  var biggest_amount = BigInt(0)
  best_route = null

  for (route of routes) {
    if (route.output_amount > biggest_amount) {
      biggest_amount = route.output_amount
      best_route = route
    }
  }

  if (best_route) {
    console.log('selected route:', best_route.path, ' - amount:', biggest_amount)
  }

  swap_token2_amount = biggest_amount

}

function update_input_price(){

  if(is_aergo(token1) && is_aergo(token2)){
    swap_token1_amount = swap_token2_amount
    return
  }
  if (swap_token2_amount==0) {
    swap_token1_amount = 0
    return
  }

  // select the best route

  var first_token = (token1=='aergo') ? waergo : token1
  var last_token  = (token2=='aergo') ? waergo : token2

  for (route of routes) {
    var tokenB = last_token
    var amount = swap_token2_amount
    var path = token_info[tokenB].symbol
    for (var i = route.length - 1; i >= 0; i--) {
      var pair = route[i]
      var tokenA = pair.other_token[tokenB]
      amount = calculate_input(amount, pair.reserves[tokenA], pair.reserves[tokenB])
      path = token_info[tokenA].symbol + ' > ' + path
      tokenB = tokenA
    }
    if (tokenB!=first_token) amount = null
    route.path = path
    route.input_amount = amount
  }

  var lowest_amount = null
  best_route = null

  for (route of routes) {
    if (route.input_amount != null) {
      if (lowest_amount==null || route.input_amount < lowest_amount) {
        lowest_amount = route.input_amount
        best_route = route
      }
    }
  }

  if (best_route) {
    console.log('selected route:', best_route.path, ' - amount:', lowest_amount)
  }

  if (lowest_amount==null) lowest_amount = BigInt(0)
  swap_token1_amount = lowest_amount

}

var update_routes_timer = null

// after the routes are retrieved
// only when the swap window is currently shown

function enable_router_timer(){
  if(update_routes_timer==null && routes.length > 0){
    update_routes_timer = setInterval(update_routes, 30 * 1000) // 30 seconds
  }
}

// when another token is selected
// when the swap window is not shown

function disable_router_timer(){
  if(update_routes_timer!=null){
    clearInterval(update_routes_timer)
    update_routes_timer = null
  }
}

function update_routes(){

  // request updated pair_info from all pairs

  if (routes.length == 0) {
    disable_router_timer()
    return
  }

  if( (swap_input==1 && swap_token1_amount==0) ||
      (swap_input==2 && swap_token2_amount==0) ){
    return
  }

  let current_route_req = last_route_req  // use let here

  //! can all the calls the done in a single multicall?

  // get unique pairs
  var pairs = new Set()
  for (route of routes) {
    for (pair of route) {
      pairs.add(pair.address)
    }
  }

  var calls = []
  for (pair of pairs) {
    calls.push([pair, "get_pool_info"])
  }

  aergo.queryContract(multicall, "aggregate", calls).then(function(results){

    if (current_route_req != last_route_req) return

    var n = 0
    for (call of calls) {
      var pair_address = call[0]
      update_pair_info(pair_address, results[n])
      n += 1
    }

    update_swap_price()
  })

}

function invert_routes(){
  for (route of routes) {
    route.reverse()
  }
}


//---------------------------------------------------------------------
// ADD LIQUIDITY
//---------------------------------------------------------------------

var pair_address = null
var pair_token1 = ''
var pair_token2 = ''
var pair_token1_amount = ''
var pair_token2_amount = ''

var to_add = {token1_amount: BigInt(0), token2_amount: BigInt(0)}

var sent_base_token = false

function add_on_chain_changed(){

  if (chainId == "aergo.io") {
    pair_token1  = 'aergo'
    pair_token2  = ''
  } else if (chainId == "testnet.aergo.io") {
    pair_token1  = 'aergo'
    pair_token2  = ''
  } else if (chainId == "alpha.aergo.io") {
    pair_token1  = 'aergo'
    pair_token2  = ''
  }

  update_add_liquidity()

}

function update_add_button(text){
  if(!account_address){
    return
  }
  var button = document.getElementById("show-add-liquidity-page")
  button.innerHTML = text
}

function on_add_liquidity_click(){

  var i = $(this).parent().attr('pair')
  //pair_address = $(this).parent().attr('pair')

  //var pool = current_pool_list[pair_address]
  var pool = current_pool_list[i]

  pair_address = pool.pair
  pair_token1 = (pool.token1==waergo) ? 'aergo' : pool.token1
  pair_token2 = (pool.token2==waergo) ? 'aergo' : pool.token2

  update_add_liquidity()
  show_add_liquidity()

}

$('#show-add-liquidity-page').click(function(){

  if(!account_address){
    connect_wallet_click()
    return
  }

  if(pair_token1=='' || pair_token2==''){
    add_on_chain_changed()
  }else{
    update_add_liquidity()
  }

  show_add_liquidity()

})

function update_add_liquidity(){

  add_liquidity_set_token('#add-liquidity-select-token1', 1)
  add_liquidity_set_token('#add-liquidity-select-token2', 2)

  $('#add-token1-amount').val('')
  $('#add-token2-amount').val('')

  $('#max-token1').removeClass('hidden')
  $('#max-token2').removeClass('hidden')

  to_add.token1_amount = BigInt(0)
  to_add.token2_amount = BigInt(0)

  //add_pool_update_pair()

  add_pool_update_balances()
  add_pool_update_info()
  add_pool_update_buttons()

}

function show_add_liquidity(){
  show_page('add-liquidity-page')
}

function add_liquidity_set_token(parent, n){

  var token = (n==1) ? pair_token1 : pair_token2

  var symbol = token_info[token].symbol
  //var imgsrc = token_info[token].logo
  var imgsrc = 'https://res.cloudinary.com/sushi-cdn/image/fetch/w_64,f_auto,q_auto,fl_sanitize/https://raw.githubusercontent.com/sushiswap/assets/master/blockchains/ethereum/assets/0x91Af0fBB28ABA7E31403Cb457106Ce79397FD4E6/logo.png'

  var img = $(parent + ' > div > div:nth-child(1) > div > div > span > img')[0]
  img.alt = symbol
  img.src = imgsrc
  img.srcset = imgsrc + ' 1x, ' + imgsrc + ' 2x'

  var div = $(parent + ' > div > div:nth-child(2) > div:nth-child(2) > div')
  div.html(symbol)

}

function on_token_selected_add(address){

  //var name = token_info[address].name
  var symbol = token_info[address].symbol
  //var decimals = token_info[address].decimals

  if(selecting_token==3){
    pair_token1 = address
  }else{
    pair_token2 = address
  }

  pair_address = null

  update_add_liquidity()

  get_pair_info(pair_token1, pair_token2, function(address){
    pair_address = address
    add_pool_update_info()
    add_pool_update_buttons()
  })

}

function add_liquidity_select_token(n){
  if(n==1){
    selecting_token = 3
  }else{
    selecting_token = 4
  }
  // show the token selector
  $("#token-selector").removeClass('hidden')
}
$('#add-liquidity-select-token1').click(function(){ add_liquidity_select_token(1) })
$('#add-liquidity-select-token2').click(function(){ add_liquidity_select_token(2) })

function use_max_amount(input, n){
  var token = (n==1) ? pair_token1 : pair_token2
  var token_amount = `token${n}_amount`
  to_add[token_amount] = BigInt(balances[token])
  var amount_str = to_decimal_str(balances[token], token_info[token].decimals, 6)
  $(input).val(amount_str)
  on_add_token_input_changed(n)
}
$('#max-token1').click(function(){
  use_max_amount('#add-token1-amount', 1)
})
$('#max-token2').click(function(){
  use_max_amount('#add-token2-amount', 2)
})

function on_add_token_input(event){

  var elem = event.target

  var n = (elem.id=='add-token1-amount') ? 1 : 2
  var token = (n==1) ? pair_token1 : pair_token2

  try {

    var decimals = token_info[token].decimals

    var token_amount = convert_typed_amount(elem.value, decimals)
    if (!token_amount) token_amount = '0'

    if(n==1){
      to_add.token1_amount = BigInt(token_amount)
    }else{
      to_add.token2_amount = BigInt(token_amount)
    }

  } catch (e) {
    console.log('on_add_token_input error:', e)
    return
  }

  on_add_token_input_changed(n)
}

function on_add_token_input_changed(n){

  var rates = add_pool_update_info(n)

  var pair = pair_info[pair_address]
  if(pair && rates[0]!=0 && rates[1]!=0){
    var other_input, id

    var decimals1 = token_info[pair_token1].decimals
    var decimals2 = token_info[pair_token2].decimals

    if(n==1){
      other_input = to_decimal_str(to_add.token2_amount, decimals2, 6)
      id = 'add-token2-amount'
    }else{
      other_input = to_decimal_str(to_add.token1_amount, decimals1, 6)
      id = 'add-token1-amount'
    }

    document.getElementById(id).value = other_input
  }

}

var input = document.getElementById('add-token1-amount')
input.addEventListener('input', on_add_token_input)
input.addEventListener('keydown', function(event) {
  const key = event.key
  if (key === "Backspace" || key === "Delete") {
    on_add_token_input(event)
  }
})

var input = document.getElementById('add-token2-amount')
input.addEventListener('input', on_add_token_input)
input.addEventListener('keydown', function(event) {
  const key = event.key
  if (key === "Backspace" || key === "Delete") {
    on_add_token_input(event)
  }
})

function add_pool_update_balances(){

  var amount

  try{
    amount = balances[pair_token1].toString()
    amount = to_decimal_str(amount, token_info[pair_token1].decimals, 6)
  }catch(e){
    amount = '0'
  }
  $('#add-balance-token1').html(tr('Balance:') + ' ' + amount)

  try{
    amount = balances[pair_token2].toString()
    amount = to_decimal_str(amount, token_info[pair_token2].decimals, 6)
  }catch(e){
    amount = '0'
  }
  $('#add-balance-token2').html(tr('Balance:') + ' ' + amount)

}

function add_pool_update_info(n){

  var pair = pair_info[pair_address]

  var token1 = (pair_token1=='aergo') ? waergo : pair_token1
  var token2 = (pair_token2=='aergo') ? waergo : pair_token2

  var is_empty = false

  var pair_token1_amount = BigInt(0)
  var pair_token2_amount = BigInt(0)
  if( pair ){
    pair_token1_amount = pair.reserves[token1]
    pair_token2_amount = pair.reserves[token2]
  }
  if( pair_token1_amount==0 && pair_token2_amount==0 ){
    pair_token1_amount = to_add.token1_amount
    pair_token2_amount = to_add.token2_amount
    is_empty = true
  }

  //var total_token1_amount = pair_token1_amount + to_add.token1_amount
  //var total_token2_amount = pair_token2_amount + to_add.token2_amount

  var rate1, rate2, rate1_str, rate2_str

  var symbol1 = token_info[pair_token1].symbol
  var symbol2 = token_info[pair_token2].symbol

  if( pair_token1_amount==0 || pair_token2_amount==0 ){

    rate1 = BigInt(0)
    rate2 = BigInt(0)
    rate1_str = '0'
    rate2_str = '0'

  }else{

    var base1 = BigInt(10) ** BigInt(token_info[pair_token1].decimals)
    var base2 = BigInt(10) ** BigInt(token_info[pair_token2].decimals)
    var base3 = BigInt(10) ** BigInt(18)

    rate1 = (pair_token1_amount * base2 * base3) / (pair_token2_amount * base1)
    rate2 = (pair_token2_amount * base1 * base3) / (pair_token1_amount * base2)

    rate1_str = to_decimal_str(rate1, 18, 6)
    rate2_str = to_decimal_str(rate2, 18, 6)

    if(n==1){
      to_add.token2_amount = to_add.token1_amount * rate2 * base2 / (base3 * base1)
    }else if(n==2){
      to_add.token1_amount = to_add.token2_amount * rate1 * base1 / (base3 * base2)
    }

  }

  // 0.000 XXX per YYY
  $('#add-rate1').html(rate1_str + ' ' + symbol1 + ' per ' + symbol2)
  $('#add-rate2').html(rate2_str + ' ' + symbol2 + ' per ' + symbol1)


  // compute the amount of LP tokens to receive
  var lptoken_supply = BigInt(pair ? pair.lptoken_amount : '0')
  var lptoken_to_receive
  if (lptoken_supply==0) {
    var minimum_liquidity = BigInt("1000")
    lptoken_to_receive = bigint_sqrt(to_add.token1_amount * to_add.token2_amount) - minimum_liquidity
  }else{
    var token1_ratio = lptoken_supply * to_add.token1_amount / pair.reserves[token1]
    var token2_ratio = lptoken_supply * to_add.token2_amount / pair.reserves[token2]
    if (token1_ratio <= token2_ratio) {
      lptoken_to_receive = token1_ratio
    }else{
      lptoken_to_receive = token2_ratio
    }
  }

  // compute the user share of the pool
  var share = 0.0
  if(pair && lptoken_to_receive > 0){
    share = parseFloat(lptoken_to_receive * BigInt(10000) / (lptoken_supply + lptoken_to_receive)) / 100
  }

  $('#add-pool-share').html(share.toFixed(2) + '%')


  to_add.rate1_str = rate1_str
  to_add.rate2_str = rate2_str
  to_add.receive_lptokens = lptoken_to_receive
  to_add.share = share

  if(is_empty){
    rate1 = BigInt(0)
    rate2 = BigInt(0)
  }
  return [rate1, rate2]
}

function bigint_sqrt(value){
  if (value < 0n) {
    throw 'square root of negative numbers is not supported'
  }

  if (value < 2n) {
    return value
  }

  function newtonIteration(n, x0) {
    const x1 = ((n / x0) + x0) >> 1n
    if (x0 === x1 || x0 === (x1 - 1n)) {
      return x0
    }
    return newtonIteration(n, x1)
  }

  return newtonIteration(value, 1n)
}

function add_pool_update_buttons(){

  // they cannot be the same token
  var is_same_token = (pair_token1==pair_token2) ||
        (is_aergo(pair_token1) && is_aergo(pair_token2));

  if(is_same_token || pair_address==null || pair_address != ''){
    $('#create-pair').addClass('hidden')
  }else{
    $('#create-pair').removeClass('hidden')
  }

  //$('#add-token1-button').prop('disabled', pair_address==null || pair_address=='')
  //$('#add-token2-button').prop('disabled', pair_address==null || pair_address=='')

  if(is_same_token || pair_address==null || pair_address==''){
    $('#add-buttons').addClass('hidden')
    return
  }else{
    $('#add-buttons').removeClass('hidden')
  }

  var base_token  = pair_info[pair_address].token2
  var other_token = pair_info[pair_address].token1

  if (base_token==waergo && (pair_token1=='aergo' || pair_token2=='aergo')) {
    base_token = 'aergo'
  }
  if (other_token==waergo && (pair_token1=='aergo' || pair_token2=='aergo')) {
    other_token = 'aergo'
  }

  var prefix = sent_base_token ? 'Undo ' : ''
  $('#add-token1-button').html(prefix + 'Add ' + token_info[base_token].symbol)
  $('#add-token2-button').html('Add ' + token_info[other_token].symbol)

  $('#add-token1-button').prop('disabled', false)
  $('#add-token2-button').prop('disabled', !sent_base_token)

}

$('#create-pair > button').click(function(){

  var pair_tokenA = (pair_token1=='aergo') ? waergo : pair_token1
  var pair_tokenB = (pair_token2=='aergo') ? waergo : pair_token2

  var txdata = {
    type: 5,  // CALL
    from: account_address,
    to: swap_factory,
    amount: 0,
    payload_json: {
      Name: "new_pair",
      Args: [pair_tokenA, pair_tokenB]
    }
  }

  startTxSendRequest(txdata, tr('Create pool'), function(result){

    pair_address = result.replace(/^"|"$/g, '')

    get_pair_info(pair_tokenA, pair_tokenB, function(address){
      add_pool_update_info()
    })

    update_pair_info(pair_address, [
      pair_tokenA, // token1
      pair_tokenB, // token2
      '',   // lptoken - not returned
      '0',  // token1_amount
      '0',  // token2_amount
      '0'   // lptoken_amount
    ])

    //add_pool_update_info()
    add_pool_update_buttons()

    //var url = 'https://' + site + '/account/' + pair_address
    //document.getElementById("pair-address").href = url
  });

})

function add_first_token(){

  var base_token = pair_info[pair_address].token2
  if (base_token==waergo && (pair_token1=='aergo' || pair_token2=='aergo')) {
    base_token = 'aergo'
  }

  var token_amount = (base_token==pair_token1) ? to_add.token1_amount : to_add.token2_amount
  if (token_amount==0) {
    return
  }
  token_amount = token_amount.toString()

  var symbol = token_info[base_token].symbol

  // disable the input boxes, so the user cannot change the values while adding liquidity
  $('#add-token1-amount').prop('disabled', true)
  $('#add-token2-amount').prop('disabled', true)
  $('#max-token1').prop('disabled', true)
  $('#max-token2').prop('disabled', true)

  // prepare and send the transaction

  var txdata

  if (base_token=='aergo') {
    txdata = {
      type: 5,  // CALL
      from: account_address,
      to: waergo,
      amount: token_amount + ' aer',
      payload_json: {
        Name: "wrap_to",
        Args: [pair_address, "store_token"]
      }
    }
  }else{
    txdata = {
      type: 5,  // CALL
      from: account_address,
      to: base_token,
      amount: 0,
      payload_json: {
        Name: "transfer",
        Args: [pair_address, token_amount, "store_token"]
      }
    }
  }

  startTxSendRequest(txdata, 'The ' + symbol + ' was sent!', function(result){

    sent_base_token = true
    add_pool_update_buttons()

    get_account_balances([base_token])

  });

}

function remove_first_token(){

  var base_token = pair_info[pair_address].token2
  if (base_token==waergo && (pair_token1=='aergo' || pair_token2=='aergo')) {
    base_token = 'aergo'
  }

  var symbol = token_info[base_token].symbol


// it could make the input boxes disabled, so the user cannot change the values


  var unwrap_aergo = (base_token=='aergo')

  var txdata = {
    type: 5,  // CALL
    from: account_address,
    to: pair_address,
    amount: 0,
    payload_json: {
      Name: "withdraw_stored_token",
      Args: [unwrap_aergo]
    }
  }

  startTxSendRequest(txdata, 'Your ' + symbol + ' was withdrawn!', function(result){

    sent_base_token = false
    add_pool_update_buttons()

    $('#add-token1-amount').prop('disabled', false)
    $('#add-token2-amount').prop('disabled', false)
    $('#max-token1').prop('disabled', false)
    $('#max-token2').prop('disabled', false)

    get_account_balances([base_token])

  });

}

function confirm_add_img(n){

  if(n==1){
    var symbol = token_info[pair_token1].symbol
  }else{
    var symbol = token_info[pair_token2].symbol
  }

  var imgsrc = 'https://res.cloudinary.com/sushi-cdn/image/fetch/w_64,f_auto,q_auto,fl_sanitize/https://raw.githubusercontent.com/sushiswap/assets/master/blockchains/ethereum/assets/0x91Af0fBB28ABA7E31403Cb457106Ce79397FD4E6/logo.png'

  var img = $('#confirm-add-img'+n)[0]
  img.alt = symbol
  img.src = imgsrc
  img.srcset = imgsrc + ' 1x, ' + imgsrc + ' 2x'
}

$('#add-token1-button').click(function(){

  if (to_add.token1_amount<=0 || to_add.token2_amount<=0) return

  $('#confirm-add-receive').html(to_decimal_str(to_add.receive_lptokens, token_info[pair_token1].decimals, 6))

  confirm_add_img(1)
  confirm_add_img(2)

  $('#confirm-add-token1 > div:nth-child(1)').html(token_info[pair_token1].symbol + ' Deposited')
  $('#confirm-add-token1 > div:nth-child(2) > div')
      .html(to_decimal_str(to_add.token1_amount, token_info[pair_token1].decimals, 6))
  $('#confirm-add-token1 > div:nth-child(2) > span')
      .html(token_info[pair_token1].symbol)

  $('#confirm-add-token2 > div:nth-child(1)').html(token_info[pair_token2].symbol + ' Deposited')
  $('#confirm-add-token2 > div:nth-child(2) > div')
      .html(to_decimal_str(to_add.token2_amount, token_info[pair_token2].decimals, 6))
  $('#confirm-add-token2 > div:nth-child(2) > span')
      .html(token_info[pair_token2].symbol)

  $("#confirm-add-pair").html(token_info[pair_token1].symbol + '/' + token_info[pair_token2].symbol)
  $("#confirm-add-rate1").html('1 ' + token_info[pair_token1].symbol +
      ' = ' + to_add.rate2_str + ' ' + token_info[pair_token2].symbol)
  $("#confirm-add-rate2").html('1 ' + token_info[pair_token2].symbol +
      ' = ' + to_add.rate1_str + ' ' + token_info[pair_token1].symbol)

  $("#confirm-add-share").html(to_add.share.toFixed(2) + '%')

  $("#confirm-add-liquidity").removeClass('hidden')

  $("#confirm-add-slippage").html(tr('Output is estimated. If the price changes by more than {0}% your transaction will revert.', slippage))
})

$('#close-confirm-add-liquidity').click(function(){
  $("#confirm-add-liquidity").addClass('hidden')
})

$('#confirm-add-button').click(function(){

  var button = this

  if(button.innerHTML.substr(0,3) == 'Add'){
    add_first_token()
  }else{
    remove_first_token()
  }

})

$('#add-token2-button').click(function(){

  var other_token = pair_info[pair_address].token1
  if (other_token==waergo && (pair_token1=='aergo' || pair_token2=='aergo')) {
    other_token = 'aergo'
  }

  var token_amount = (other_token==pair_token1) ? to_add.token1_amount : to_add.token2_amount
  if (token_amount==0) {
    return
  }
  token_amount = token_amount.toString()

  var symbol = token_info[other_token].symbol


  // prepare and send the transaction

  var txdata

  if (other_token=='aergo') {
    txdata = {
      type: 5,  // CALL
      from: account_address,
      to: waergo,
      amount: token_amount + ' aer',
      payload_json: {
        Name: "wrap_to",
        Args: [pair_address, "add_liquidity"]
      }
    }
  }else{
    txdata = {
      type: 5,  // CALL
      from: account_address,
      to: other_token,
      amount: 0,
      payload_json: {
        Name: "transfer",
        Args: [pair_address, token_amount, "add_liquidity"]
      }
    }
  }

  startTxSendRequest(txdata, tr('Add liquidity'), function(result){

    sent_base_token = false
    //add_pool_update_buttons()

    $('#add-token1-amount').prop('disabled', false)
    $('#add-token2-amount').prop('disabled', false)

    load_user_pools(true)
    show_page('pool-page')

    get_account_balances([other_token])

  });

})


//---------------------------------------------------------------------
// REMOVE LIQUIDITY
//---------------------------------------------------------------------

/*
$('#show-remove-liquidity-page').click(function(){
  show_page('remove-liquidity-page')
})
*/

var remove_pool
var percent_to_remove = 100
var receive_aergo_as

function on_remove_liquidity_click(){
  var i = $(this).parent().attr('pair')
  //pair_address = $(this).parent().attr('pair')

  //var pool = current_pool_list[pair_address]
  var pool = current_pool_list[i]

  remove_pool = pool

  var symbol1 = token_info[pool.token1].symbol
  var symbol2 = token_info[pool.token2].symbol

  var decimals1 = token_info[pool.token1].decimals
  var decimals2 = token_info[pool.token2].decimals

  $('#liquidity-percent').val('100')

  receive_aergo_as = 'aergo'
  if (pool.token1==waergo) symbol1 = 'AERGO'
  if (pool.token2==waergo) symbol2 = 'AERGO'

  if(is_aergo(pool.token1) || is_aergo(pool.token2)){
    $('#receive-aergo').removeClass('hidden')
    $('#receive-aergo').html('Receive WAERGO')
  }else{
    $('#receive-aergo').addClass('hidden')
  }

  var imgsrc = 'https://res.cloudinary.com/sushi-cdn/image/fetch/w_64,f_auto,q_auto,fl_sanitize/https://raw.githubusercontent.com/sushiswap/assets/master/blockchains/ethereum/assets/0x91Af0fBB28ABA7E31403Cb457106Ce79397FD4E6/logo.png';

  ['#remove-token1-logo1','#remove-token1-logo2'].forEach(function(path){
    //var imgsrc = token_info[pool.token1].logo;
    var img = $(path)[0];
    img.alt = symbol1;
    img.src = imgsrc;
    img.srcset = imgsrc + ' 1x, ' + imgsrc + ' 2x';
  });

  ['#remove-token2-logo1','#remove-token2-logo2'].forEach(function(path){
    //var imgsrc = token_info[pool.token2].logo;
    var img = $(path)[0];
    img.alt = symbol2;
    img.src = imgsrc;
    img.srcset = imgsrc + ' 1x, ' + imgsrc + ' 2x';
  });

  $('#remove-pair').html(symbol1 + '/' + symbol2)
  //$('#remove-lptokens').html(pool.lptoken_amount.toFixed(6))
  $('#remove-lptokens').html(to_decimal_str(pool.lptoken_amount, 18, 6))

  $('#remove-liquidity-output > div:nth-child(1) > div:nth-child(2) > div:nth-child(2)')
    .html(symbol1)

  $('#remove-liquidity-output > div:nth-child(2) > div:nth-child(2) > div:nth-child(2)')
    .html(symbol2)

  $('#remove-new-position > div:nth-child(1) > div:nth-child(2)')
    .html(pool.share.toFixed(6) + '%')

  $('#remove-new-position > div:nth-child(2) > div:nth-child(1)')
    .html(symbol1 + ':')

  $('#remove-new-position > div:nth-child(3) > div:nth-child(1)')
    .html(symbol2 + ':')

  $('#remove-new-position > div:nth-child(2) > div:nth-child(2) > div:nth-child(2)')
    .html(symbol1)

  $('#remove-new-position > div:nth-child(3) > div:nth-child(2) > div:nth-child(2)')
    .html(symbol2)

  $('#remove-new-position > div:nth-child(2) > div:nth-child(2) > div:nth-child(1)')
    .html(to_decimal_str(pool.token1_amount, decimals1, 6))

  $('#remove-new-position > div:nth-child(3) > div:nth-child(2) > div:nth-child(1)')
    .html(to_decimal_str(pool.token2_amount, decimals2, 6))

  update_remove_liquidity()

  show_page('remove-liquidity-page')
}

function update_remove_liquidity(){

  var pool = remove_pool

  percent_to_remove = Number($('#liquidity-percent').val())

  if(percent_to_remove > 100){
    percent_to_remove = 100
    $('#liquidity-percent').val('100')
  }else if(percent_to_remove < 0){
    percent_to_remove = 0
    $('#liquidity-percent').val('')
  }

  var percent_num = BigInt(parseInt(percent_to_remove * 1000))
  var percent_den = BigInt(100000)

  var token1_amount = BigInt(pool.token1_amount) * percent_num / percent_den
  var token2_amount = BigInt(pool.token2_amount) * percent_num / percent_den

  var decimals1 = token_info[pool.token1].decimals
  var decimals2 = token_info[pool.token2].decimals

  $('#remove-liquidity-output > div:nth-child(1) > div:nth-child(2) > div:nth-child(1)')
    .html(to_decimal_str(token1_amount, decimals1, 6))

  $('#remove-liquidity-output > div:nth-child(2) > div:nth-child(2) > div:nth-child(1)')
    .html(to_decimal_str(token2_amount, decimals2, 6))

}

var input = document.getElementById('liquidity-percent')
input.addEventListener('input', update_remove_liquidity)
input.addEventListener('keydown', function(event) {
  const key = event.key
  if (key === "Backspace" || key === "Delete") {
    update_remove_liquidity(event)
  }
})

$('#receive-aergo').click(function(){

  receive_aergo_as = (receive_aergo_as=='aergo') ? waergo : 'aergo'

  var other_token = (receive_aergo_as=='aergo') ? 'WAERGO' : 'AERGO'
  $('#receive-aergo').html('Receive ' + other_token)

  var symbol = (receive_aergo_as=='aergo') ? 'AERGO' : 'WAERGO'
  var n = (remove_pool.token1==waergo) ? 1 : 2

  $('#remove-liquidity-output > div:nth-child(' + n + ') > div:nth-child(2) > div:nth-child(2)')
    .html(symbol)

})

$('#remove-liquidity-button').click(function(){

  var pool = remove_pool

  var percent_num = BigInt(parseInt(percent_to_remove * 1000))
  var percent_den = BigInt(100000)

  var lptoken_amount = BigInt(pool.lptoken_amount) * percent_num / percent_den
  lptoken_amount = lptoken_amount.toString()


  var args = {}

  if (receive_aergo_as=='aergo') {
    args['unwrap_aergo'] = true
  }

  var txdata = {
    type: 5,  // CALL
    from: account_address,
    to: pool.lptoken,
    amount: 0,
    payload_json: {
      Name: "transfer",
      Args: [pair_address, lptoken_amount, "", args]
    }
  }

  startTxSendRequest(txdata, tr('Remove Liquidity'), function(){

    // on success:
    load_user_pools(true)
    show_page('pool-page')

    get_account_balances([pool.token1, pool.token2, pool.lptoken])

  });

})

//---------------------------------------------------------------------
// I18N
//---------------------------------------------------------------------

function translate(text){
  if (!window.App.I18N.locale) return text
  var translated = window.App.I18N.localeStrings[text]
  if (!translated) translated = text
  return translated
}

function tr(format){
  format = translate(format)
  var args = Array.prototype.slice.call(arguments, 1);
  return format.replace(/{(\d+)}/g, function(match, number) {
    return typeof args[number] != 'undefined'
        ? args[number]
        : match
  })
}

const $langSelector = $('#lang_selector');
const $langTrigger = $langSelector.find('button');
const $langSelectorListHolder = $langSelector.find('#lang_selector_list_holder');
const $langSelectorLocaleName = $langSelector.find('#lang_selector_locale_name');
const $translateStrings = $('[data-i18n-tr]');
$translateStrings.each((_, el) => {
  el.setAttribute('data-i18n-tr', el.textContent)
});
const $translateStringsAttrs = $('[data-i18n-tr-attr]');
$translateStringsAttrs.each((_, el) => {
  const attrName = el.getAttribute('data-i18n-tr-attr')
  const value = el.getAttribute(attrName)
  el.setAttribute('data-i18n-tr-attr', `${attrName}:::${value}`)
})

function render_lang_list() {
  fetch('/langs/langs_list.json')
    .then((res) => res.json())
    .then((langList) => {
      Object.keys(langList).forEach((l) => window.App.I18N.locales.add(l))
      const matchingLocale = [...window.App.I18N.locales.values()]
          .find((l) => new RegExp(`^${l}`).test(navigator.language))
      if (matchingLocale) {
        window.App.I18N.locale = matchingLocale
        $langSelectorLocaleName.html(langList[matchingLocale])
      }
      $langSelector.addClass('lg:flex');
      const $langList = $(`
        <div 
            id="lang_selector_list"
            class="hidden absolute max-h-[240px] overflow-auto w-full border-2 mt-2 divide-y rounded shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none border-dark-900 bg-dark-1000 divide-dark-900">
            ${Object.entries(langList).map(([key, val]) => (`
                <div
                    data-i18n-lang-key="${key}" 
                    class="text-sm leading-5 font-bold cursor-pointer select-none text-primary px-3 py-2 cursor-pointer hover:bg-dark-900/40">
                ${val}
                </div>
            `)).join("")}
        </div>
      `);
      $langSelectorListHolder.append($langList);

      $langList.find('[data-i18n-lang-key]').each((_, el) => {
        el.addEventListener('click', (event) => {
          const locale = event.target.getAttribute('data-i18n-lang-key');
          $langSelectorLocaleName.html(langList[locale]);
          window.App.I18N.locale = locale;
        })
      });
      $langTrigger.on('click', () => {
        window.App.I18N.localeSelectorUI.isShown = !window.App.I18N.localeSelectorUI.isShown;
      });

    })
    .catch(err => console.error(err));
}

function init_i18n() {
  window.App = {
    ...(window.App ? window.App : {}),
    I18N: new Proxy(
        {
          locale: 'en',
          localeStrings: {},
          translateElems: new Map(),
          translateElemsAttrs: new Map(),
          locales: new Set(),
          localeSelectorUI: new Proxy(
              {
                isShown: false
              },
              {
                set: function (obj, prop, value) {
                  switch (prop) {
                    case 'isShown': {
                      const $langList = $('#lang_selector_list');
                      if (value === true) {
                        $langList.removeClass('hidden');
                      } else {
                        $langList.addClass('hidden');
                      }
                      break;
                    }
                  }
                  obj[prop] = value;
                }
              }
          )
        },
      {
        set: function (obj, prop, value) {
          switch (prop) {
            case 'locale': {
              const $langList = $('#lang_selector_list');
              fetch(`/langs/${value}.json`)
                  .then((res) => res.json())
                  .then((translations) => {
                    obj.localeStrings = {...translations};
                    [...window.App.I18N.translateElems.entries()].forEach(([key, els]) => {
                      try {
                        els.forEach((el) => $(el).html(tr(key)));
                      } catch (e) {
                        console.error(e);
                      }
                    });
                    [...window.App.I18N.translateElemsAttrs.entries()].forEach(([key, els]) => {
                      els.forEach((el) => {
                        const trAttr = el.getAttribute('data-i18n-tr-attr');
                        if (trAttr.includes(':::')) {
                          const [attrName, _] = trAttr.split(':::');
                          const [__, value] = key.split(':::');
                          try {
                            el.setAttribute(attrName, tr(value));
                          } catch (e) {
                            console.error(e);
                          }
                        }
                      })
                    });
                  })
                  .catch((err) => console.error(err))
                  .finally(() => {
                    $langList.addClass('hidden');
                  })
              break;
            }
          }
          obj[prop] = value;
        }
      }
    )
  }
  $translateStrings.each((_, el) => {
    let key = el.getAttribute('data-i18n-tr');
    window.App.I18N.translateElems.set(
        key,
        window.App.I18N.translateElems.has(key) && Array.isArray(window.App.I18N.translateElems.get(key))
            ? [...window.App.I18N.translateElems.get(key), el]
            : [el]
    );
  });
  $translateStringsAttrs.each((_, el) => {
    let key = el.getAttribute('data-i18n-tr-attr');
    window.App.I18N.translateElemsAttrs.set(
        key,
        window.App.I18N.translateElemsAttrs.has(key) && Array.isArray(window.App.I18N.translateElemsAttrs.get(key))
            ? [...window.App.I18N.translateElemsAttrs.get(key), el]
            : [el]
    );
  })
  render_lang_list()
}

//---------------------------------------------------------------------
// ONLOAD
//---------------------------------------------------------------------

document.body.onload = function() {

  document.getElementById("main-button").onclick = swap_click;
  document.getElementById("connect-wallet").onclick = connect_wallet_click;

  //document.getElementById("select-token1").onclick = select_token_click;
  //document.getElementById("select-token2").onclick = select_token_click;

  // mainnet as default
  chainId = "aergo.io"
//! temporary !
  chainId = "testnet.aergo.io"

  on_chain_selected()
  get_token_list()
  init_i18n()
}
