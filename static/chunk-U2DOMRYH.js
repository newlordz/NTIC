import{a as se}from"./chunk-BSGEOLV7.js";import{a as te}from"./chunk-GFOVAQUI.js";import"./chunk-OEAZAIB6.js";import{c as ne,e as ie,h as oe,t as re}from"./chunk-4PZJBL5L.js";import{$a as N,Aa as n,Ba as t,Ca as w,Da as M,Ea as V,Fa as y,Ga as f,Ha as d,M as D,Oa as $,Pa as i,Pb as Q,Qa as m,Ra as v,T as g,U as x,Ua as k,Ub as Z,Va as P,Vb as b,Wa as I,Ya as L,Za as G,ab as R,bb as U,fa as C,hb as W,ja as o,jc as ee,ka as S,mb as H,nb as q,pb as J,pc as ae,sa as u,sb as Y,ua as l,ub as X,va as z,wa as O,wb as K}from"./chunk-3I7Y5M5O.js";import"./chunk-MON7YFGF.js";var ce=()=>["/talent"];function me(r,p){if(r&1){let e=y();n(0,"img",61),f("error",function(){g(e);let a=d().ngIf;return x(a.url=null)}),t()}if(r&2){let e=d().ngIf;l("src",e.url,C)}}function ge(r,p){if(r&1&&(n(0,"span"),i(1),t()),r&2){let e=d().ngIf,s=d(2);o(),m(e.initials||s.getSponsorName(s.loggedInSponsor).charAt(0).toUpperCase())}}function xe(r,p){if(r&1&&(M(0),u(1,me,1,1,"img",60)(2,ge,2,1,"span",2),V()),r&2){let e=p.ngIf;o(),l("ngIf",e.url),o(),l("ngIf",!e.url)}}function fe(r,p){if(r&1&&(n(0,"span"),i(1),t()),r&2){let e=d(2);o(),v(" \xB7 ",e.loggedInSponsor==null?null:e.loggedInSponsor.email,"")}}function ue(r,p){if(r&1&&(n(0,"span"),i(1," \xB7 "),n(2,"strong"),i(3),t()()),r&2){let e=d(2);o(3),m(e.loggedInSponsor==null?null:e.loggedInSponsor.tier)}}function ve(r,p){if(r&1){let e=y();n(0,"div",62)(1,"span",63),i(2,"payments"),t(),n(3,"p",64),i(4,"No settlement logged yet"),t(),n(5,"p",65),i(6,"You can record an official bank wire, corporate cheque, or mobile money contribution directly below."),t(),n(7,"button",39),f("click",function(){g(e);let a=d(2);return x(a.openPaymentModal())}),n(8,"span",14),i(9,"add_card"),t(),i(10," Settle Contribution Now "),t()()}}function _e(r,p){if(r&1&&(n(0,"div",80),i(1),t()),r&2){let e=d().$implicit;o(),v(" ",e.notes," ")}}function ye(r,p){if(r&1&&(n(0,"div",81)(1,"a",82)(2,"span",83),i(3,"attachment"),t(),i(4," View Bank Slip / Receipt "),t()()),r&2){let e=d().$implicit;o(),l("href",e.proof_file_url,C)}}function he(r,p){r&1&&(n(0,"span",84),i(1,"check_circle"),t())}function be(r,p){r&1&&(n(0,"span",85),i(1,"schedule"),t())}function Se(r,p){r&1&&(n(0,"span",86),i(1,"cancel"),t())}function Ee(r,p){if(r&1&&(n(0,"div",68)(1,"div")(2,"div",69)(3,"span",70),i(4),t(),n(5,"span",71),i(6),t()(),n(7,"div",48),i(8),n(9,"strong",72),i(10),t()(),u(11,_e,2,1,"div",73)(12,ye,5,1,"div",74),t(),n(13,"div",75)(14,"div",76),i(15),t(),u(16,he,2,0,"span",77)(17,be,2,0,"span",78)(18,Se,2,0,"span",79),t()()),r&2){let e=p.$implicit;o(4),v("GH\u20B5 ",e.amount,""),o(),O("primary",e.status==="verified")("warn",e.status==="pending")("error",e.status==="rejected"),o(),v(" ",e.status," "),o(2),v(" ",e.method," \xB7 Ref: "),o(2),m(e.reference),o(),l("ngIf",e.notes),o(),l("ngIf",e.proof_file_url),o(3),m(e.created_at?e.created_at.split("T")[0]:"Recorded"),o(),l("ngIf",e.status==="verified"),o(),l("ngIf",e.status==="pending"),o(),l("ngIf",e.status==="rejected")}}function Ce(r,p){if(r&1&&(n(0,"div",66),u(1,Ee,19,16,"div",67),t()),r&2){let e=d(2);o(),l("ngForOf",e.myPayments)}}function we(r,p){if(r&1&&(n(0,"div",80),i(1),t()),r&2){let e=d().$implicit;o(),v(" ",e.notes," ")}}function ke(r,p){if(r&1&&(n(0,"div",68)(1,"div")(2,"div",69)(3,"span",70),i(4),t(),n(5,"span",87),i(6),t()(),n(7,"div",48),i(8),n(9,"strong",72),i(10),t()(),u(11,we,2,1,"div",73),t(),n(12,"div",75)(13,"div",76),i(14),t(),n(15,"span",84),i(16,"check_circle"),t()()()),r&2){let e=p.$implicit;o(4),m(e.amount),o(2),m(e.status),o(2),v(" ",e.method," \xB7 Ref: "),o(2),m(e.refNo),o(),l("ngIf",e.notes),o(3),m(e.date)}}function Pe(r,p){if(r&1&&(n(0,"div",66),u(1,ke,17,6,"div",67),t()),r&2){let e=d(2);o(),l("ngForOf",e.loggedInSponsor==null?null:e.loggedInSponsor.payments)}}function Ie(r,p){if(r&1&&(n(0,"div",121)(1,"span",14),i(2,"check_circle"),t(),i(3),t()),r&2){let e=d(3);o(3),v(" ",e.paymentSuccessMessage," ")}}function Te(r,p){if(r&1){let e=y();n(0,"div",66)(1,"div",122)(2,"div",123)(3,"span",31),i(4,"account_balance"),t(),i(5," NTIC Championship Foundation \xB7 Ecobank Ghana "),t(),n(6,"span",124),i(7,"Direct Deposit / Wire"),t()(),n(8,"div",125)(9,"div")(10,"div",126),i(11,"Receiving Account Number"),t(),n(12,"div",127),i(13,"1441002938101"),t()(),n(14,"button",128),f("click",function(){g(e);let a=d(3);return x(a.copyText("1441002938101","Account number"))}),n(15,"span",83),i(16,"content_copy"),t(),i(17," Copy "),t()(),n(18,"div",129)(19,"div")(20,"strong",130),i(21,"Bank:"),t(),i(22," Ecobank Ghana PLC"),t(),n(23,"div")(24,"strong",130),i(25,"Branch:"),t(),i(26," Accra Main"),t(),n(27,"div")(28,"strong",130),i(29,"SWIFT:"),t(),i(30," ECOGHAC"),t(),n(31,"div")(32,"strong",130),i(33,"Currency:"),t(),i(34," GHS (Ghana Cedi)"),t()()()}}function ze(r,p){if(r&1){let e=y();n(0,"div",66)(1,"div",122)(2,"div",123)(3,"span",31),i(4,"smartphone"),t(),i(5," NTIC Official MoMo Pay Line "),t(),n(6,"span",124),i(7,"MTN / Telecel / AT"),t()(),n(8,"div",131)(9,"div",132)(10,"div")(11,"div",133),i(12,"Merchant ID"),t(),n(13,"div",134),i(14,"NTIC-NTI"),t()(),n(15,"button",135),f("click",function(){g(e);let a=d(3);return x(a.copyText("NTIC-NTI","Merchant code"))}),n(16,"span",83),i(17,"content_copy"),t()()(),n(18,"div",132)(19,"div")(20,"div",133),i(21,"MoMo Line"),t(),n(22,"div",134),i(23,"055-123-4567"),t()(),n(24,"button",135),f("click",function(){g(e);let a=d(3);return x(a.copyText("0551234567","MoMo number"))}),n(25,"span",83),i(26,"content_copy"),t()()()(),n(27,"div",136),i(28,"Account Name: "),n(29,"strong",130),i(30,"NTIC Foundation"),t()()()}}function Me(r,p){r&1&&(n(0,"div",137)(1,"div",138)(2,"span",31),i(3,"receipt_long"),t(),i(4," Corporate Cheque Remittance "),t(),n(5,"div"),i(6,"Issue crossed corporate cheque to: "),n(7,"strong",130),i(8,"NTIC Championship Foundation"),t()(),n(9,"div",139),i(10,"Deliver to Secretariat Desk or provide bank deposit slip reference below."),t()())}function Ve(r,p){if(r&1){let e=y();n(0,"div",28)(1,"input",140,0),f("change",function(a){g(e);let c=d(3);return x(c.onProofFileSelected(a))}),t(),n(3,"button",141),f("click",function(){g(e);let a=$(2);return x(a.click())}),n(4,"span",31),i(5,"upload_file"),t(),i(6),t(),n(7,"span",139),i(8,"PDF, PNG, JPG (Max 10MB)"),t()()}if(r&2){let e=d(3);o(3),l("disabled",e.isUploadingProof),o(3),v(" ",e.isUploadingProof?"Uploading Receipt...":"Attach Proof of Payment"," ")}}function Ne(r,p){if(r&1){let e=y();n(0,"div",142)(1,"div",69)(2,"span",143),i(3,"check_circle"),t(),n(4,"span",144),i(5),t()(),n(6,"div",145)(7,"a",146),i(8,"View"),t(),n(9,"button",147),f("click",function(){g(e);let a=d(3);return x(a.removeProofFile())}),i(10,"Remove"),t()()()}if(r&2){let e=d(3);o(5),m(e.proofFileName||"Payment Proof Attached"),o(2),l("href",e.proofFileUrl,C)}}function Fe(r,p){if(r&1&&(n(0,"div",148),i(1),t()),r&2){let e=d(3);o(),v(" ",e.paymentError," ")}}function Ae(r,p){r&1&&(n(0,"span"),i(1,"Confirm & Record Payment"),t())}function Oe(r,p){r&1&&(n(0,"span"),i(1,"Processing..."),t())}function Re(r,p){if(r&1){let e=y();n(0,"div",88),f("click",function(){g(e);let a=d(2);return x(a.closePaymentModal())}),n(1,"div",89),f("click",function(a){return g(e),x(a.stopPropagation())}),n(2,"div",90)(3,"div",91)(4,"div",92)(5,"span",93),i(6,"payments"),t()(),n(7,"div")(8,"h3",94),i(9,"Sponsorship Remittance"),t(),n(10,"p",95),i(11,"Record your bank wire or mobile transfer for reconciliation"),t()()(),n(12,"button",96),f("click",function(){g(e);let a=d(2);return x(a.closePaymentModal())}),n(13,"span",97),i(14,"close"),t()()(),u(15,Ie,4,1,"div",98),n(16,"div",99)(17,"div")(18,"label",100),i(19," 1. Payment Destination "),t(),n(20,"div",101)(21,"button",102),f("click",function(){g(e);let a=d(2);return x(a.selectedPaymentMethod="Bank Transfer")}),n(22,"span",31),i(23,"account_balance"),t(),i(24," Bank Wire "),t(),n(25,"button",102),f("click",function(){g(e);let a=d(2);return x(a.selectedPaymentMethod="Mobile Money")}),n(26,"span",31),i(27,"smartphone"),t(),i(28," Mobile Money "),t(),n(29,"button",102),f("click",function(){g(e);let a=d(2);return x(a.selectedPaymentMethod="Corporate Cheque")}),n(30,"span",31),i(31,"receipt_long"),t(),i(32," Cheque "),t()()(),n(33,"div",103),u(34,Te,35,0,"div",41)(35,ze,31,0,"div",41)(36,Me,11,0,"div",104),t(),n(37,"div")(38,"label",100),i(39," 2. Transaction Confirmation "),t(),n(40,"div",105)(41,"div",106)(42,"label",107),i(43,"Amount Paid (GH\u20B5) "),n(44,"span",108),i(45,"*"),t()(),n(46,"input",109),I("ngModelChange",function(a){g(e);let c=d(2);return P(c.paymentForm.amount,a)||(c.paymentForm.amount=a),x(a)}),t()(),n(47,"div",106)(48,"label",107),i(49,"Transaction Reference # "),n(50,"span",108),i(51,"*"),t()(),n(52,"input",110),I("ngModelChange",function(a){g(e);let c=d(2);return P(c.paymentForm.refNo,a)||(c.paymentForm.refNo=a),x(a)}),t()()()(),n(53,"div",111)(54,"label",107),i(55,"Payment Notes (Optional)"),t(),n(56,"input",112),I("ngModelChange",function(a){g(e);let c=d(2);return P(c.paymentForm.notes,a)||(c.paymentForm.notes=a),x(a)}),t()(),n(57,"div",113)(58,"label",107),i(59,"Payment Proof (Bank Slip, Receipt, or MoMo SMS)"),t(),u(60,Ve,9,2,"div",114)(61,Ne,11,2,"div",115),t(),n(62,"div",116)(63,"span",117),i(64,"verified"),t(),n(65,"div"),i(66,"The NTIC Financial Secretariat reconciles transactions directly against bank statements. Official CSR tax receipts are issued upon confirmation."),t()()(),u(67,Fe,2,1,"div",118),n(68,"div",119)(69,"button",15),f("click",function(){g(e);let a=d(2);return x(a.closePaymentModal())}),i(70,"Cancel"),t(),n(71,"button",120),f("click",function(){g(e);let a=d(2);return x(a.submitPayment())}),u(72,Ae,2,0,"span",2)(73,Oe,2,0,"span",2),t()()()()}if(r&2){let e=d(2);o(15),l("ngIf",e.paymentSuccessMessage),o(6),z("background",e.selectedPaymentMethod==="Bank Transfer"?"var(--surface-card, #ffffff)":"transparent")("color",e.selectedPaymentMethod==="Bank Transfer"?"var(--primary, #003f87)":"var(--text-secondary, #64748b)")("box-shadow",e.selectedPaymentMethod==="Bank Transfer"?"0 1px 3px rgba(0,0,0,0.08)":"none"),o(4),z("background",e.selectedPaymentMethod==="Mobile Money"?"var(--surface-card, #ffffff)":"transparent")("color",e.selectedPaymentMethod==="Mobile Money"?"var(--primary, #003f87)":"var(--text-secondary, #64748b)")("box-shadow",e.selectedPaymentMethod==="Mobile Money"?"0 1px 3px rgba(0,0,0,0.08)":"none"),o(4),z("background",e.selectedPaymentMethod==="Corporate Cheque"?"var(--surface-card, #ffffff)":"transparent")("color",e.selectedPaymentMethod==="Corporate Cheque"?"var(--primary, #003f87)":"var(--text-secondary, #64748b)")("box-shadow",e.selectedPaymentMethod==="Corporate Cheque"?"0 1px 3px rgba(0,0,0,0.08)":"none"),o(5),l("ngIf",e.selectedPaymentMethod==="Bank Transfer"),o(),l("ngIf",e.selectedPaymentMethod==="Mobile Money"),o(),l("ngIf",e.selectedPaymentMethod==="Corporate Cheque"),o(10),k("ngModel",e.paymentForm.amount),o(6),k("ngModel",e.paymentForm.refNo),o(4),k("ngModel",e.paymentForm.notes),o(4),l("ngIf",!e.proofFileUrl),o(),l("ngIf",e.proofFileUrl),o(6),l("ngIf",e.paymentError),o(4),l("disabled",e.isSubmittingPayment),o(),l("ngIf",!e.isSubmittingPayment),o(),l("ngIf",e.isSubmittingPayment)}}function Be(r,p){if(r&1){let e=y();M(0),n(1,"div",4)(2,"div",5)(3,"div",6),u(4,xe,3,2,"ng-container",2),N(5,"async"),t(),n(6,"div")(7,"div",7)(8,"span",8),i(9,"VIP EXECUTIVE PORTAL"),t(),n(10,"span",9),i(11),t()(),n(12,"h1",10),i(13),t(),n(14,"p",11),i(15),u(16,fe,2,1,"span",2)(17,ue,4,1,"span",2),t()()(),n(18,"div",12)(19,"button",13),f("click",function(){g(e);let a=d();return x(a.openPaymentModal())}),n(20,"span",14),i(21,"payments"),t(),i(22," Settle Sponsorship "),t(),n(23,"button",15),f("click",function(){g(e);let a=d();return x(a.downloadCertificate())}),n(24,"span",14),i(25,"workspace_premium"),t(),i(26," CSR Certificate "),t(),n(27,"button",15),f("click",function(){g(e);let a=d();return x(a.downloadVIPPass())}),n(28,"span",14),i(29,"confirmation_number"),t(),i(30," VIP Guest Pass "),t()()(),n(31,"div",16)(32,"div",17)(33,"div",18),i(34,"monetization_on"),t(),n(35,"div",19)(36,"span",14),i(37,"monetization_on"),t(),i(38,"Total Paid"),t(),n(39,"div",20),i(40),t(),n(41,"div",21),i(42),t()(),n(43,"div",22)(44,"div",18),i(45,"handshake"),t(),n(46,"div",19)(47,"span",14),i(48,"handshake"),t(),i(49,"Partnership Tier"),t(),n(50,"div",23),i(51),t(),n(52,"div",21),i(53,"Active Package"),t()(),n(54,"div",24)(55,"div",18),i(56,"rocket_launch"),t(),n(57,"div",19)(58,"span",14),i(59,"rocket_launch"),t(),i(60,"Track Supported"),t(),n(61,"div",23),i(62),t(),n(63,"div",21),i(64,"NTI Ghana Championship"),t()(),n(65,"div",17)(66,"div",18),i(67,"verified"),t(),n(68,"div",19)(69,"span",14),i(70,"verified"),t(),i(71,"Account Status"),t(),n(72,"div",23),i(73),t(),n(74,"div",21),i(75,"Verified Partner"),t()()(),n(76,"div",25)(77,"div",26)(78,"div",27)(79,"div",28)(80,"span",29),i(81,"corporate_fare"),t(),n(82,"h3"),i(83,"Partnership Representation"),t()(),n(84,"button",30),f("click",function(){g(e);let a=d();return x(a.openEditProfileModal())}),n(85,"span",31),i(86,"edit"),t(),i(87," Update Phone "),t()(),n(88,"div",32)(89,"div",33)(90,"span",34),i(91,"Organization"),t(),n(92,"span",35),i(93),t()(),n(94,"div",33)(95,"span",34),i(96,"Representative"),t(),n(97,"span",35),i(98),t()(),n(99,"div",33)(100,"span",34),i(101,"Corporate Email"),t(),n(102,"span",35),i(103),t()(),n(104,"div",33)(105,"span",34),i(106,"Official Phone"),t(),n(107,"span",35),i(108),t()(),n(109,"div",33)(110,"span",34),i(111,"Partnership Tier"),t(),n(112,"span",35)(113,"strong",36),i(114),t()()(),n(115,"div",33)(116,"span",34),i(117,"Partner Access Pass"),t(),n(118,"span",37),i(119),t()()()(),n(120,"div",26)(121,"div",27)(122,"div",28)(123,"span",38),i(124,"receipt_long"),t(),n(125,"h3"),i(126,"Contributions & Settlement Ledger"),t()(),n(127,"button",39),f("click",function(){g(e);let a=d();return x(a.openPaymentModal())}),n(128,"span",31),i(129,"credit_card"),t(),i(130," Pay / Settle "),t()(),n(131,"div",32),u(132,ve,11,0,"div",40)(133,Ce,2,1,"div",41)(134,Pe,2,1,"div",41),t()(),n(135,"div",26)(136,"div",27)(137,"div",28)(138,"span",42),i(139,"palette"),t(),n(140,"h3"),i(141,"Brand Showcase & Exposure"),t()(),n(142,"span",43),i(143,"Active Accreditation"),t()(),n(144,"div",32)(145,"div",44)(146,"div",45)(147,"span",46),i(148,"business"),t()(),n(149,"div")(150,"div",47),i(151),t(),n(152,"div",48),i(153),t()()(),n(154,"div",33)(155,"span",34),i(156,"Public Showcase"),t(),n(157,"span",35),i(158,"Listed in Official NTIC Partner Directory"),t()(),n(159,"div",33)(160,"span",34),i(161,"Accreditation Tier"),t(),n(162,"span",35),i(163),t()(),n(164,"div",33)(165,"span",34),i(166,"Track Alignment"),t(),n(167,"span",35),i(168),t()()()(),n(169,"div",26)(170,"div",27)(171,"div",28)(172,"span",49),i(173,"emoji_events"),t(),n(174,"h3"),i(175,"Talent Scouting & VIP Access"),t()(),n(176,"button",30),f("click",function(){g(e);let a=d();return x(a.downloadVIPPass())}),n(177,"span",31),i(178,"print"),t(),i(179," Print Pass "),t()(),n(180,"div",32)(181,"div",50)(182,"div",51)(183,"span",52),i(184,"VIP Corporate Accreditation"),t(),n(185,"span",53),i(186),t()(),n(187,"div",54),i(188,"Executive Championship Pass"),t(),n(189,"div",21),i(190," Token: "),n(191,"code",55),i(192),t()()(),n(193,"div",56)(194,"div")(195,"div",57),i(196,"Discover Emerging Tech Talent"),t(),n(197,"div",58),i(198),t()(),n(199,"a",59)(200,"span",31),i(201,"person_search"),t(),i(202," Explore Talent "),t()()()()(),u(203,Re,74,31,"div",3),V()}if(r&2){let e=d();o(4),l("ngIf",R(5,29,e.sponsorAvatar$)),o(7),v("TOKEN: ",e.loggedInSponsor==null?null:e.loggedInSponsor.ticket,""),o(2),m(e.getSponsorName(e.loggedInSponsor)),o(2),v(" ",e.loggedInSponsor==null?null:e.loggedInSponsor.fullName," "),o(),l("ngIf",e.loggedInSponsor==null?null:e.loggedInSponsor.email),o(),l("ngIf",e.loggedInSponsor==null?null:e.loggedInSponsor.tier),o(23),v("GH\u20B5 ",e.totalVerified,""),o(2),v("Verified \xB7 Pledged: GH\u20B5 ",e.totalPledged,""),o(9),m((e.loggedInSponsor==null?null:e.loggedInSponsor.tier)||"Corporate Partner"),o(11),m((e.loggedInSponsor==null?null:e.loggedInSponsor.track)||"All Tracks"),o(11),m((e.loggedInSponsor==null?null:e.loggedInSponsor.status)||"Active"),o(20),m(e.loggedInSponsor!=null&&e.loggedInSponsor.organization&&(e.loggedInSponsor==null?null:e.loggedInSponsor.organization)!=="_pending_profile"?e.loggedInSponsor==null?null:e.loggedInSponsor.organization:"--"),o(5),m((e.loggedInSponsor==null?null:e.loggedInSponsor.fullName)||"--"),o(5),m((e.loggedInSponsor==null?null:e.loggedInSponsor.email)||"--"),o(5),m((e.loggedInSponsor==null?null:e.loggedInSponsor.phone)||"--"),o(6),m((e.loggedInSponsor==null?null:e.loggedInSponsor.tier)||"Official Partner"),o(5),m(e.loggedInSponsor==null?null:e.loggedInSponsor.ticket),o(13),l("ngIf",!(e.myPayments!=null&&e.myPayments.length)&&!(!(e.loggedInSponsor==null||e.loggedInSponsor.payments==null)&&e.loggedInSponsor.payments.length)),o(),l("ngIf",e.myPayments==null?null:e.myPayments.length),o(),l("ngIf",!(e.myPayments!=null&&e.myPayments.length)&&(e.loggedInSponsor==null||e.loggedInSponsor.payments==null?null:e.loggedInSponsor.payments.length)),o(17),m(e.getSponsorName(e.loggedInSponsor)),o(2),v("Track: ",(e.loggedInSponsor==null?null:e.loggedInSponsor.track)||"All Competition Tracks",""),o(10),m((e.loggedInSponsor==null?null:e.loggedInSponsor.tier)||"Corporate Partner"),o(5),m((e.loggedInSponsor==null?null:e.loggedInSponsor.track)||"All Tracks"),o(18),m((e.loggedInSponsor==null?null:e.loggedInSponsor.status)||"Active"),o(6),m(e.loggedInSponsor==null?null:e.loggedInSponsor.ticket),o(6),v("Browse verified portfolios & projects in ",(e.loggedInSponsor==null?null:e.loggedInSponsor.track)||"all tracks",""),o(),l("routerLink",G(31,ce)),o(4),l("ngIf",e.isPaymentModalOpen)}}function je(r,p){r&1&&(n(0,"div",166),i(1," Loading pending payments... "),t())}function De(r,p){r&1&&(n(0,"div",167)(1,"span",168),i(2,"check_circle"),t(),i(3," All sponsor payment claims have been verified. No pending transactions. "),t())}function $e(r,p){if(r&1&&(n(0,"span"),i(1," \xB7 Sponsor: "),n(2,"strong"),i(3),t()()),r&2){let e=d().$implicit;o(3),m(e.organization||e.sponsor_name)}}function Le(r,p){if(r&1&&(n(0,"span"),i(1),N(2,"date"),t()),r&2){let e=d().$implicit;o(),v(" \xB7 Logged: ",U(2,1,e.created_at,"mediumDate"),"")}}function Ge(r,p){if(r&1&&(n(0,"div",48),i(1),t()),r&2){let e=d().$implicit;o(),v(" Notes: ",e.notes," ")}}function Ue(r,p){if(r&1&&(n(0,"div",81)(1,"a",82)(2,"span",83),i(3,"receipt"),t(),i(4," View Attached Bank Slip / Receipt "),t()()),r&2){let e=d().$implicit;o(),l("href",e.proof_file_url,C)}}function We(r,p){if(r&1){let e=y();n(0,"div",171)(1,"div")(2,"div",69)(3,"span",172),i(4),t(),n(5,"span",173),i(6),t(),n(7,"span",174),i(8,"Awaiting Verification"),t()(),n(9,"div",21),i(10," Ref: "),n(11,"strong",72),i(12),t(),u(13,$e,4,1,"span",2)(14,Le,3,4,"span",2),t(),u(15,Ge,2,1,"div",175)(16,Ue,5,1,"div",74),t(),n(17,"div",176)(18,"button",177),f("click",function(){let a=g(e).$implicit,c=d(4);return x(c.verifyPayment(a,!0))}),n(19,"span",31),i(20,"check"),t(),i(21," Confirm & Verify "),t(),n(22,"button",178),f("click",function(){let a=g(e).$implicit,c=d(4);return x(c.verifyPayment(a,!1))}),n(23,"span",31),i(24,"close"),t(),i(25," Reject "),t()()()}if(r&2){let e=p.$implicit,s=d(4);o(4),v("GH\u20B5 ",e.amount,""),o(2),m(e.method),o(6),m(e.reference),o(),l("ngIf",e.organization||e.sponsor_name),o(),l("ngIf",e.created_at),o(),l("ngIf",e.notes),o(),l("ngIf",e.proof_file_url),o(2),l("disabled",s.isVerifyingPayment[e.id]),o(4),l("disabled",s.isVerifyingPayment[e.id])}}function He(r,p){if(r&1&&(n(0,"div",169),u(1,We,26,9,"div",170),t()),r&2){let e=d(3);o(),l("ngForOf",e.pendingPayments)}}function qe(r,p){if(r&1&&(n(0,"div",159)(1,"div",27)(2,"div",28)(3,"span",29),i(4,"verified_user"),t(),n(5,"h3",160),i(6,"Sponsor Payment Verification Queue"),t()(),n(7,"span",161),i(8),t()(),n(9,"div",162),u(10,je,2,0,"div",163)(11,De,4,0,"div",164)(12,He,2,1,"div",165),t()()),r&2){let e=d(2);o(7),O("primary",e.pendingPayments.length>0)("secondary",e.pendingPayments.length===0),o(),v(" ",e.pendingPayments.length," Pending "),o(2),l("ngIf",e.isLoadingPendingPayments),o(),l("ngIf",!e.isLoadingPendingPayments&&e.pendingPayments.length===0),o(),l("ngIf",!e.isLoadingPendingPayments&&e.pendingPayments.length>0)}}function Je(r,p){r&1&&(n(0,"div",179)(1,"span",180),i(2,"handshake"),t(),n(3,"p",181),i(4,"No active sponsors registered yet."),t(),n(5,"p",182),i(6,"Create sponsor accounts from the Admin Dashboard to get started."),t()())}function Ye(r,p){if(r&1&&(n(0,"span"),i(1),t()),r&2){let e=d().$implicit;o(),v(" \xB7 ",e.phone,"")}}function Xe(r,p){if(r&1&&(n(0,"div",26)(1,"div",183)(2,"div",184),i(3),t(),n(4,"div",185)(5,"div",186)(6,"span",187),i(7),t(),n(8,"span",43),i(9),t(),n(10,"span",188),i(11),t()(),n(12,"div",189),i(13),u(14,Ye,2,1,"span",2),t()(),n(15,"div",190),i(16),t()()()),r&2){let e=p.$implicit;o(3),v(" ",e.name.charAt(0).toUpperCase()," "),o(4),m(e.name),o(2),m(e.tier),o(2),m(e.status),o(2),v(" ",e.email," "),o(),l("ngIf",e.phone),o(2),m(e.ticket)}}function Ke(r,p){if(r&1&&(M(0),n(1,"div",149)(2,"div")(3,"h1",150),i(4,"Sponsor Management"),t(),n(5,"p",151),i(6,"CSR impact monitoring, student tracking, and sponsorship analytics"),t()()(),n(7,"div",152)(8,"div",17)(9,"div",18),i(10,"handshake"),t(),n(11,"div",19)(12,"span",14),i(13,"handshake"),t(),i(14,"Active Sponsors"),t(),n(15,"div",153),i(16),t()(),n(17,"div",22)(18,"div",18),i(19,"monetization_on"),t(),n(20,"div",19)(21,"span",14),i(22,"monetization_on"),t(),i(23,"Total Committed"),t(),n(24,"div",154),i(25),t()(),n(26,"div",17)(27,"div",18),i(28,"paid"),t(),n(29,"div",19)(30,"span",14),i(31,"paid"),t(),i(32,"Total Received"),t(),n(33,"div",154),i(34),t(),n(35,"div",21),i(36),t()(),n(37,"div",24)(38,"div",18),i(39,"groups"),t(),n(40,"div",19)(41,"span",14),i(42,"groups"),t(),i(43,"Beneficiaries Reached"),t(),n(44,"div",153),i(45),N(46,"number"),t(),n(47,"div",21),i(48,"Students in Ecosystem"),t()()(),u(49,qe,13,8,"div",155),n(50,"div",156),u(51,Je,7,0,"div",157)(52,Xe,17,7,"div",158),t(),V()),r&2){let e=d();o(16),m(e.activeSponsors.length),o(9),m(e.totalCommitted),o(9),m(e.totalReceived),o(2),v("",e.receivedPercentage,"% fulfilled"),o(9),m(e.totalBeneficiaries>0?R(46,8,e.totalBeneficiaries):"1,248"),o(4),l("ngIf",e.isAdmin),o(2),l("ngIf",e.activeSponsors.length===0),o(),l("ngForOf",e.activeSponsors)}}function Qe(r,p){if(r&1&&(n(0,"div",121)(1,"span",14),i(2,"check_circle"),t(),i(3),t()),r&2){let e=d(2);o(3),v(" ",e.profileSuccessMessage," ")}}function Ze(r,p){r&1&&(n(0,"span"),i(1,"Save Phone Number"),t())}function et(r,p){r&1&&(n(0,"span"),i(1,"Saving..."),t())}function tt(r,p){if(r&1){let e=y();n(0,"div",88),f("click",function(){g(e);let a=d();return x(a.closeEditProfileModal())}),n(1,"div",191),f("click",function(a){return g(e),x(a.stopPropagation())}),n(2,"div",192)(3,"div",28)(4,"span",193),i(5,"contact_phone"),t(),n(6,"h3",194),i(7,"Edit Sponsor Contact"),t()(),n(8,"button",195),f("click",function(){g(e);let a=d();return x(a.closeEditProfileModal())}),n(9,"span",14),i(10,"close"),t()()(),u(11,Qe,4,1,"div",98),n(12,"div",196)(13,"div",106)(14,"div",197)(15,"label",198),i(16,"Company / Organization Name"),t(),n(17,"span",199)(18,"span",200),i(19,"lock"),t(),i(20," Secretariat Accredited "),t()(),w(21,"input",201),t(),n(22,"div",106)(23,"div",197)(24,"label",198),i(25,"CSR Representative Full Name"),t(),n(26,"span",199)(27,"span",200),i(28,"lock"),t(),i(29," Secretariat Accredited "),t()(),w(30,"input",201),t(),n(31,"div",106)(32,"label",202),i(33,"Contact Phone Number *"),t(),n(34,"input",203),I("ngModelChange",function(a){g(e);let c=d();return P(c.profileEditForm.phone,a)||(c.profileEditForm.phone=a),x(a)}),t(),n(35,"div",204),i(36," Direct telephone or WhatsApp number for event credentials and VIP coordination. "),t()(),n(37,"div",106)(38,"div",197)(39,"label",198),i(40,"Partnership Tier"),t(),n(41,"span",199)(42,"span",200),i(43,"lock"),t(),i(44," Fixed "),t()(),w(45,"input",201),t(),n(46,"div",106)(47,"div",197)(48,"label",198),i(49,"Supported Competition Track"),t(),n(50,"span",199)(51,"span",200),i(52,"lock"),t(),i(53," Fixed "),t()(),w(54,"input",201),t(),n(55,"div",205)(56,"span",206),i(57,"info"),t(),n(58,"div"),i(59,"Organization name, representative, tier, and track are provisioned by the NTIC Secretariat. Only your contact phone number may be edited directly."),t()()(),n(60,"div",207)(61,"button",15),f("click",function(){g(e);let a=d();return x(a.closeEditProfileModal())}),i(62,"Cancel"),t(),n(63,"button",120),f("click",function(){g(e);let a=d();return x(a.saveProfile())}),u(64,Ze,2,0,"span",2)(65,et,2,0,"span",2),t()()()()}if(r&2){let e=d();o(11),l("ngIf",e.profileSuccessMessage),o(10),l("value",e.profileEditForm.organization),o(9),l("value",e.profileEditForm.fullName),o(4),k("ngModel",e.profileEditForm.phone),o(11),l("value",e.profileEditForm.tier),o(9),l("value",e.profileEditForm.track),o(9),l("disabled",e.isSavingProfile),o(),l("ngIf",!e.isSavingProfile),o(),l("ngIf",e.isSavingProfile)}}var xt=(()=>{class r{constructor(e,s,a,c,_){this.contentService=e,this.dialogService=s,this.apiService=a,this.currentUser=c,this.cdr=_,this.sponsorAvatar$=this.currentUser.avatar$(),this.isEditProfileModalOpen=!1,this.profileEditForm={organization:"",fullName:"",phone:"",tier:"",track:""},this.isSavingProfile=!1,this.profileSuccessMessage="",this.isPaymentModalOpen=!1,this.selectedPaymentMethod="Bank Transfer",this.paymentForm={amount:"",refNo:"",notes:""},this.isSubmittingPayment=!1,this.paymentSuccessMessage="",this.proofFile=null,this.proofFileName="",this.proofFileUrl="",this.isUploadingProof=!1,this.ecosystemSummary=null,this.isLoadingEcosystemSummary=!1,this.pendingPayments=[],this.isLoadingPendingPayments=!1,this.isVerifyingPayment={},this.mySponsorships=[],this.myPayments=[],this.paymentError="",this.isLoadingSponsorship=!1,this.pledgeAmountInput="",this.isSavingPledge=!1}get isAdmin(){let e=(b("activeRoleId")||"").toLowerCase();return e==="admin"||e==="super_admin"}ngOnInit(){this.currentUser.ensureLoaded().subscribe(()=>{this.loadSponsorData(),this.loadEcosystemSummary(),this.isAdmin&&this.loadPendingPayments()}),this.loadEcosystemSummary(),this.isAdmin&&this.loadPendingPayments(),this.cdr.markForCheck()}openEditProfileModal(){let e=this.loggedInSponsor;e&&(this.profileEditForm={organization:e.organization&&e.organization!=="_pending_profile"?e.organization:"",fullName:e.fullName||"",phone:e.phone||"",tier:e.tier||"Gold Partner (GH\u20B5 20k-100k)",track:e.track||"All Tracks"},this.profileSuccessMessage="",this.isEditProfileModalOpen=!0)}closeEditProfileModal(){this.isEditProfileModalOpen=!1}saveProfile(){if(!this.loggedInSponsor)return;let s=this.profileEditForm.phone.trim();if(!s){this.dialogService.toast("Please enter a valid contact phone number.","warning");return}this.isSavingProfile=!0,this.apiService.updateMyProfile({phone:s}).subscribe({next:()=>{this.currentUser.refresh().subscribe(()=>{this.isSavingProfile=!1,this.profileSuccessMessage="Contact phone number updated successfully!",setTimeout(()=>{this.closeEditProfileModal()},1e3)})},error:()=>{this.isSavingProfile=!1,this.dialogService.toast("Failed to save contact phone number. Please try again.","error")}})}get loggedInSponsor(){if(b("activeRoleId")!=="sponsor")return null;let s=this.currentUser.profile();if(s)return{id:s.id,email:s.email,fullName:s.full_name,role:s.role,ticket:s.ticket,status:s.status,organization:s.organization,phone:s.phone||"",tier:s.tier||"Gold Partner (GH\u20B5 20k-100k)",track:s.track||"All Tracks",registeredAt:s.created_at||"Active",photo_file_id:s.photo_file_id||""};let a=b("activeUserEmail")||"",c=b("activeUserTicket")||"",_=b("activeUserName")||"";return a||c?{id:c||a,email:a,fullName:_||"Corporate Sponsor",role:"sponsor",ticket:c,status:"Active",organization:_||"",phone:"",tier:"Gold Partner (GH\u20B5 20k-100k)",track:"All Tracks",registeredAt:"Active"}:null}get isSponsorLoggedIn(){return b("activeRoleId")==="sponsor"||!!this.loggedInSponsor}getSponsorName(e){return e?e.organization&&e.organization!=="_pending_profile"?e.organization:e.fullName||"Corporate Partner":"Sponsor Partner"}getSponsorTier(e){return e&&e.tier||"Partner"}getSponsorTotal(e){return e?e.total?e.total:e.payments&&e.payments.length>0?`GH\u20B5 ${e.payments.reduce((a,c)=>{let _=parseInt(c.amount.replace(/[^0-9]/g,""),10)||0;return a+_},0).toLocaleString()}`:"GH\u20B5 0":"GH\u20B5 0"}copyText(e,s="Copied"){e&&(navigator?.clipboard?.writeText?navigator.clipboard.writeText(e).then(()=>{this.dialogService.toast(`${s} copied to clipboard`,"success")}).catch(()=>{this.fallbackCopyText(e,s)}):this.fallbackCopyText(e,s))}fallbackCopyText(e,s="Copied"){let a=document.createElement("textarea");a.value=e,a.style.position="fixed",a.style.opacity="0",document.body.appendChild(a),a.focus(),a.select();try{document.execCommand("copy"),this.dialogService.toast(`${s} copied to clipboard`,"success")}catch{this.dialogService.toast(`Failed to copy ${s}`,"error")}document.body.removeChild(a)}openPaymentModal(){this.isPaymentModalOpen=!0,this.paymentSuccessMessage="",this.paymentError="",this.proofFile=null,this.proofFileName="",this.proofFileUrl="",this.isUploadingProof=!1,this.selectedPaymentMethod="Bank Transfer",this.paymentForm={amount:"",refNo:"",notes:""}}closePaymentModal(){this.isPaymentModalOpen=!1}onProofFileSelected(e){let s=e?.target?.files?.[0];s&&(this.proofFile=s,this.proofFileName=s.name,this.isUploadingProof=!0,this.apiService.uploadFileBlob(s).subscribe({next:a=>{this.isUploadingProof=!1,this.proofFileUrl=a.url||a.file_url||(a.file_id?`/api/files/${a.file_id}`:""),this.dialogService.toast("Payment proof uploaded successfully.","success"),this.cdr.markForCheck()},error:()=>{this.isUploadingProof=!1,this.dialogService.toast("Could not upload file. Please try again.","error"),this.cdr.markForCheck()}}))}removeProofFile(){this.proofFile=null,this.proofFileName="",this.proofFileUrl=""}submitPayment(){let e=(this.paymentForm.amount||"").trim(),s=(this.paymentForm.refNo||"").trim();if(!e||!s){this.dialogService.toast("Please enter both the payment amount and reference number.","warning");return}let a=e.replace(/[^0-9.]/g,"");if(!a||Number(a)<=0){this.dialogService.toast("Enter a payment amount greater than zero.","warning");return}if(!this.activeSponsorshipId){this.dialogService.toast("Record your sponsorship commitment before adding a payment.","warning");return}this.isSubmittingPayment=!0,this.paymentSuccessMessage="",this.paymentError="";let c=this.selectedPaymentMethod==="Mobile Money"?"mobile_money":this.selectedPaymentMethod==="Corporate Cheque"?"cheque":"bank_transfer";this.apiService.recordSponsorPayment(this.activeSponsorshipId,{amount:a,method:c,reference:s,notes:(this.paymentForm.notes||"").trim(),proof_file_url:this.proofFileUrl||void 0}).subscribe({next:()=>{this.isSubmittingPayment=!1,this.paymentSuccessMessage="Payment reference recorded. Our team will verify it against the bank statement and confirm.",this.loadSponsorData(),this.isAdmin&&this.loadPendingPayments(),this.loadEcosystemSummary(),setTimeout(()=>this.closePaymentModal(),1400)},error:_=>{this.isSubmittingPayment=!1,this.paymentError=_?.status===409?"A payment with that reference is already recorded.":_?.status===403?"You can only record payments against your own sponsorship.":_?.status===422?_?.error?.detail||"Check the amount and reference and try again.":"Could not record the payment. Nothing was saved -- please try again."}})}get activeSponsorshipId(){let e=this.mySponsorships.find(s=>s.status==="active")||this.mySponsorships[0];return e?e.id:""}get totalPledged(){return this.mySponsorships.reduce((e,s)=>e+(Number(s.amount_pledged)||0),0).toLocaleString(void 0,{maximumFractionDigits:2})}get totalVerified(){return this.mySponsorships.reduce((e,s)=>e+(Number(s.amount_received)||0),0).toLocaleString(void 0,{maximumFractionDigits:2})}get totalAwaitingVerification(){return this.mySponsorships.reduce((e,s)=>e+(Number(s.amount_pending)||0),0).toLocaleString(void 0,{maximumFractionDigits:2})}loadSponsorData(){this.loggedInSponsor&&(this.isLoadingSponsorship=!0,this.apiService.getMySponsorships().subscribe({next:e=>{this.mySponsorships=e||[],this.isLoadingSponsorship=!1},error:()=>{this.isLoadingSponsorship=!1,this.mySponsorships=[]}}),this.apiService.getMySponsorPayments().subscribe({next:e=>this.myPayments=e||[],error:()=>this.myPayments=[]}))}savePledge(){let e=(this.pledgeAmountInput||"").replace(/[^0-9.]/g,"");if(!e||Number(e)<=0){this.paymentError="Enter the amount you are committing.";return}this.isSavingPledge=!0,this.paymentError="",this.apiService.createMySponsorship({amount_pledged:e,tier:this.loggedInSponsor?.tier||"",sector:this.loggedInSponsor?.sector||""}).subscribe({next:()=>{this.isSavingPledge=!1,this.pledgeAmountInput="",this.loadSponsorData()},error:()=>{this.isSavingPledge=!1,this.paymentError="Could not record your commitment. Please try again."}})}downloadCertificate(){this.viewCSRCertificate()}downloadVIPPass(){let e=this.loggedInSponsor,s=this.getSponsorName(e),a=e?.fullName||"Corporate VIP Representative",c=e?.tier||"Corporate Partner",_=e?.ticket||"NTIC-VIP-PASS",h=window.open("","_blank","width=880,height=650");if(!h){this.dialogService.toast("Please allow popups to view and download your VIP Guest Pass.","warning");return}h.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Partner Accreditation Pass -- ${s}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background: #f1f5f9;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #0f172a;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 32px 20px;
          }
          .pass-card {
            width: 100%;
            max-width: 680px;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);
            overflow: hidden;
          }
          .pass-header {
            background: #003f87;
            color: #ffffff;
            padding: 24px 32px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .pass-jurisdiction {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: #93c5fd;
            margin-bottom: 4px;
          }
          .pass-program {
            font-size: 18px;
            font-weight: 800;
            letter-spacing: -0.3px;
            color: #ffffff;
          }
          .pass-badge {
            background: rgba(255, 255, 255, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.3);
            color: #ffffff;
            font-size: 11px;
            font-weight: 700;
            padding: 6px 12px;
            border-radius: 6px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            white-space: nowrap;
          }
          .pass-body {
            padding: 32px;
          }
          .pass-entity {
            margin-bottom: 24px;
            padding-bottom: 20px;
            border-bottom: 1px solid #e2e8f0;
          }
          .pass-org-name {
            font-size: 24px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.5px;
            margin-bottom: 4px;
          }
          .pass-tier-label {
            font-size: 13.5px;
            font-weight: 600;
            color: #003f87;
          }
          .pass-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
            margin-bottom: 24px;
          }
          .grid-cell {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 14px 16px;
          }
          .cell-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
            margin-bottom: 4px;
          }
          .cell-value {
            font-size: 14px;
            font-weight: 700;
            color: #0f172a;
          }
          .pass-token-strip {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 16px 20px;
            margin-bottom: 24px;
          }
          .token-label {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #475569;
            margin-bottom: 2px;
          }
          .token-code {
            font-family: 'JetBrains Mono', Consolas, monospace;
            font-size: 16px;
            font-weight: 700;
            color: #003f87;
            letter-spacing: 1px;
          }
          .btn-print {
            background: #003f87;
            color: #ffffff;
            font-size: 13px;
            font-weight: 600;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            transition: background-color 0.15s ease;
          }
          .btn-print:hover {
            background: #002e62;
          }
          .pass-footer {
            font-size: 12px;
            color: #64748b;
            line-height: 1.5;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 16px;
          }
          .pass-security-seal {
            font-size: 11px;
            font-weight: 600;
            color: #475569;
            text-align: right;
            white-space: nowrap;
          }
          @media print {
            body { background: #ffffff; padding: 0; }
            .pass-card { border: 1px solid #0f172a; box-shadow: none; max-width: 100%; border-radius: 0; }
            .btn-print { display: none !important; }
            .pass-header { background: #003f87 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="pass-card">
          <div class="pass-header">
            <div>
              <div class="pass-jurisdiction">Republic of Ghana &middot; Ministry of Education STEM Initiative</div>
              <div class="pass-program">National Technology &amp; Innovation Championship</div>
            </div>
            <div class="pass-badge">Accredited Partner</div>
          </div>
          <div class="pass-body">
            <div class="pass-entity">
              <h1 class="pass-org-name">${s}</h1>
              <div class="pass-tier-label">Official Accreditation: ${c}</div>
            </div>
            <div class="pass-grid">
              <div class="grid-cell">
                <div class="cell-label">Authorized Representative</div>
                <div class="cell-value">${a}</div>
              </div>
              <div class="grid-cell">
                <div class="cell-label">Accreditation Status</div>
                <div class="cell-value" style="color: #059669;">Active &middot; Provisioned</div>
              </div>
              <div class="grid-cell">
                <div class="cell-label">Credential Type</div>
                <div class="cell-value">Executive Corporate Pass</div>
              </div>
              <div class="grid-cell">
                <div class="cell-label">Governing Authority</div>
                <div class="cell-value">NTIC Championship Secretariat</div>
              </div>
            </div>
            <div class="pass-token-strip">
              <div>
                <div class="token-label">Accreditation Token ID</div>
                <div class="token-code">${_}</div>
              </div>
              <button class="btn-print" onclick="window.print()">Print Official Pass</button>
            </div>
            <div class="pass-footer">
              <div>Present this verified accreditation credential at the Executive Badging Desk for championship credentialing and venue access.</div>
              <div class="pass-security-seal">Auth ID: ${_}<br>System Verified</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `),h.document.close()}viewCSRCertificate(){let e=this.loggedInSponsor,s=this.getSponsorName(e),a=e?.fullName||"Corporate Representative",c=e?.tier||"VIP Partner",_=e?.ticket||"NTIC-SPO-VERIFIED",h=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}),E=window.open("","_blank","width=950,height=700");if(!E){this.dialogService.toast("Please allow popups to view and download your CSR Certificate.","warning");return}E.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>CSR Recognition Certificate -- ${s}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@600&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            margin: 0;
            padding: 40px 20px;
            background: #f1f5f9;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #0f172a;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
          }
          .cert-card {
            width: 100%;
            max-width: 840px;
            background: #ffffff;
            border: 2px solid #003f87;
            outline: 1px solid #cbd5e1;
            outline-offset: -10px;
            padding: 48px 56px;
            border-radius: 8px;
            text-align: center;
            box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);
          }
          .cert-jurisdiction {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 1.5px;
            text-transform: uppercase;
            color: #003f87;
            margin-bottom: 8px;
          }
          .cert-header {
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: #475569;
            text-transform: uppercase;
            margin-bottom: 24px;
          }
          .cert-title {
            font-size: 26px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.5px;
            margin: 0 0 12px;
          }
          .cert-subtitle {
            font-size: 14px;
            color: #64748b;
            margin-bottom: 20px;
          }
          .cert-org {
            font-size: 28px;
            font-weight: 800;
            color: #003f87;
            margin: 12px 0 16px;
            display: inline-block;
          }
          .cert-badge {
            display: inline-block;
            background: #eff6ff;
            color: #1e40af;
            border: 1px solid #bfdbfe;
            padding: 6px 16px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 24px;
          }
          .cert-desc {
            font-size: 14.5px;
            line-height: 1.7;
            color: #334155;
            max-width: 660px;
            margin: 0 auto 36px;
          }
          .cert-meta {
            display: flex;
            justify-content: space-around;
            margin-top: 32px;
            padding-top: 24px;
            border-top: 1px solid #e2e8f0;
          }
          .cert-sig-block {
            text-align: center;
          }
          .cert-sig-line {
            width: 180px;
            border-bottom: 1.5px solid #cbd5e1;
            margin: 0 auto 8px;
          }
          .cert-sig-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #64748b;
          }
          .cert-token {
            font-family: 'JetBrains Mono', Consolas, monospace;
            font-size: 11px;
            color: #64748b;
            margin-top: 28px;
          }
          @media print {
            body { background: #ffffff; padding: 0; }
            .cert-card { box-shadow: none; max-width: 100%; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <div class="cert-card">
          <div class="cert-jurisdiction">Republic of Ghana &middot; Ministry of Education STEM Initiative</div>
          <div class="cert-header">National Technology &amp; Innovation Championship</div>
          <h1 class="cert-title">CERTIFICATE OF CSR RECOGNITION</h1>
          <div class="cert-subtitle">This official credential of appreciation is proudly awarded to</div>
          
          <div class="cert-org">${s}</div>
          <br>
          <div class="cert-badge">${c}</div>

          <p class="cert-desc">
            In recognition of outstanding corporate social responsibility, leadership, and partnership in empowering Ghana's next generation of technology innovators and STEM champions during the <strong>National Technology &amp; Innovation Championship</strong>.
          </p>

          <div class="cert-meta">
            <div class="cert-sig-block">
              <div class="cert-sig-line"></div>
              <div class="cert-sig-title">Representative: ${a}</div>
            </div>
            <div class="cert-sig-block">
              <div class="cert-sig-line"></div>
              <div class="cert-sig-title">NTIC Governing Secretariat</div>
            </div>
            <div class="cert-sig-block">
              <div style="font-weight:700;font-size:13px;color:#0f172a;">${h}</div>
              <div class="cert-sig-title">Date of Issuance</div>
            </div>
          </div>

          <div class="cert-token">Verification Code: ${_}</div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          };
        <\/script>
      </body>
      </html>
    `),E.document.close()}printTaxReceipt(e){let s=this.loggedInSponsor,a=this.getSponsorName(s),c=s?.fullName||"Corporate Representative",_=s?.email||"sponsor@company.com",h=s?.phone||"--",E=s?.tier||"VIP Partner",B=s?.ticket||"NTIC-SPO-TAX",j=s?.payments||[],le=this.getSponsorTotal(s),de=new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"}),F=window.open("","_blank","width=900,height=750");if(!F){this.dialogService.toast("Please allow popups to view and print your Tax Receipt.","warning");return}let A="";j.length>0?A=j.map((T,pe)=>`
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${pe+1}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${T.refNo}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${T.method}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${T.date}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-weight:700;text-align:right;">${T.amount}</td>
        </tr>
      `).join(""):A=`
        <tr>
          <td colspan="5" style="padding:20px;text-align:center;color:#64748b;">No settlement transactions logged yet.</td>
        </tr>
      `,F.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>NTIC Tax Invoice & CSR Receipt -- ${a}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          body {
            margin: 0;
            padding: 40px;
            font-family: 'Inter', sans-serif;
            color: #0f172a;
            background: #f8fafc;
          }
          .invoice-card {
            max-width: 800px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 40px;
            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
          }
          .inv-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .inv-title {
            font-size: 24px;
            font-weight: 800;
            color: #2563eb;
            margin: 0 0 4px;
          }
          .inv-sub {
            font-size: 13px;
            color: #64748b;
          }
          .inv-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-bottom: 30px;
          }
          .inv-box {
            background: #f1f5f9;
            padding: 16px;
            border-radius: 8px;
            font-size: 13px;
          }
          .inv-box-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
            margin-bottom: 24px;
          }
          th {
            background: #e2e8f0;
            padding: 10px;
            text-align: left;
            font-weight: 700;
            color: #334155;
          }
          .inv-summary {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
          }
          .inv-total-box {
            background: #eff6ff;
            border: 1.5px solid #2563eb;
            padding: 16px 24px;
            border-radius: 8px;
            text-align: right;
          }
          @media print {
            body { background: #fff; padding: 0; }
            .invoice-card { box-shadow: none; border: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-card">
          <div class="inv-header">
            <div>
              <h1 class="inv-title">NTIC FOUNDATION</h1>
              <div class="inv-sub">Official Tax Invoice & CSR Payment Receipt</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">TIN: <strong>C002938101-NTIC</strong></div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:700;font-size:14px;color:#0f172a;">RECEIPT REF: ${B}</div>
              <div style="font-size:12px;color:#64748b;margin-top:4px;">Date: ${de}</div>
            </div>
          </div>

          <div class="inv-grid">
            <div class="inv-box">
              <div class="inv-box-title">Billed Sponsor Organization</div>
              <div style="font-weight:700;font-size:15px;color:#0f172a;">${a}</div>
              <div>Attn: ${c}</div>
              <div>Email: ${_}</div>
              <div>Phone: ${h}</div>
            </div>
            <div class="inv-box">
              <div class="inv-box-title">Sponsorship Details</div>
              <div>Partnership Tier: <strong>${E}</strong></div>
              <div>Access Token: <strong style="font-family:monospace;">${B}</strong></div>
              <div>Status: <strong style="color:#16a34a;">Verified Sponsor</strong></div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Transaction Ref</th>
                <th>Payment Channel</th>
                <th>Date Logged</th>
                <th style="text-align:right;">Amount Settled</th>
              </tr>
            </thead>
            <tbody>
              ${A}
            </tbody>
          </table>

          <div class="inv-summary">
            <div class="inv-total-box">
              <div style="font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;">Total Verified Contribution</div>
              <div style="font-size:24px;font-weight:800;color:#2563eb;margin-top:4px;">${le}</div>
            </div>
          </div>

          <div style="margin-top:40px;font-size:12px;color:#64748b;text-align:center;border-top:1px solid #e2e8f0;padding-top:16px;">
            Thank you for supporting the Ghana National NTI & Technology Championship.
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          };
        <\/script>
      </body>
      </html>
    `),F.document.close()}loadEcosystemSummary(){this.isLoadingEcosystemSummary=!0,this.apiService.getSponsorshipSummary().subscribe({next:e=>{this.ecosystemSummary=e,this.isLoadingEcosystemSummary=!1,this.cdr.markForCheck()},error:()=>{this.ecosystemSummary=null,this.isLoadingEcosystemSummary=!1,this.cdr.markForCheck()}})}loadPendingPayments(){this.isLoadingPendingPayments=!0,this.apiService.getPendingSponsorPayments().subscribe({next:e=>{this.pendingPayments=e||[],this.isLoadingPendingPayments=!1,this.cdr.markForCheck()},error:()=>{this.pendingPayments=[],this.isLoadingPendingPayments=!1,this.cdr.markForCheck()}})}verifyPayment(e,s){let a="";if(!s){let c=window.prompt("Please provide a reason for rejecting this payment reference:");if(!c||!c.trim()){this.dialogService.toast("Rejection reason is required.","warning");return}a=c.trim()}this.isVerifyingPayment[e.id]=!0,this.apiService.verifySponsorPayment(e.id,s,a).subscribe({next:()=>{this.isVerifyingPayment[e.id]=!1,this.dialogService.toast(s?"Payment confirmed and marked as verified.":"Payment has been rejected.",s?"success":"info"),this.loadPendingPayments(),this.loadEcosystemSummary(),this.loadSponsorData(),this.cdr.markForCheck()},error:c=>{this.isVerifyingPayment[e.id]=!1,this.dialogService.toast(c?.error?.detail||"Failed to update payment verification state.","error"),this.cdr.markForCheck()}})}get activeSponsors(){return this.contentService.users.filter(e=>e.role==="sponsor")}get totalCommitted(){return this.ecosystemSummary?.total_committed?`GH\u20B5 ${this.ecosystemSummary.total_committed}`:`${this.activeSponsors.length} sponsor${this.activeSponsors.length!==1?"s":""}`}get totalReceived(){return this.ecosystemSummary?.total_received?`GH\u20B5 ${this.ecosystemSummary.total_received}`:"GH\u20B5 0"}get totalBeneficiaries(){return this.ecosystemSummary?.total_beneficiaries||0}get receivedPercentage(){return this.ecosystemSummary?.received_pct||0}static{this.\u0275fac=function(s){return new(s||r)(S(ae),S(se),S(ee),S(te),S(W))}}static{this.\u0275cmp=D({type:r,selectors:[["app-sponsors"]],standalone:!0,features:[L],decls:4,vars:3,consts:[["proofInput",""],[1,"page-canvas","fade-in"],[4,"ngIf"],["class","modal-overlay",3,"click",4,"ngIf"],[1,"sponsor-hero-banner"],[1,"sponsor-hero-left"],[1,"sponsor-avatar"],[1,"sponsor-hero-badges"],[1,"badge","primary"],[1,"sponsor-token"],[1,"sponsor-hero-title"],[1,"sponsor-hero-sub"],[1,"sponsor-hero-actions"],[1,"btn","btn-primary",3,"click"],[1,"material-symbols-outlined"],[1,"btn","btn-subtle",3,"click"],[1,"stat-grid",2,"grid-template-columns","repeat(4,1fr)","margin-bottom","28px"],[1,"stat-card","primary"],[1,"stat-bg-icon","material-symbols-outlined"],[1,"stat-label"],[1,"stat-value",2,"font-size","22px","color","var(--primary)"],[2,"font-size","12px","color","var(--on-surface-variant)","margin-top","4px"],[1,"stat-card","secondary"],[1,"stat-value",2,"font-size","20px"],[1,"stat-card","tertiary"],[2,"display","grid","grid-template-columns","1fr 1fr","gap","24px"],[1,"card"],[1,"card-header",2,"display","flex","align-items","center","justify-content","space-between"],[2,"display","flex","align-items","center","gap","10px"],[1,"material-symbols-outlined",2,"color","var(--primary)"],[1,"btn","btn-subtle","btn-sm",3,"click"],[1,"material-symbols-outlined",2,"font-size","16px"],[1,"card-body",2,"display","flex","flex-direction","column","gap","14px"],[1,"info-row"],[1,"info-label"],[1,"info-value"],[2,"color","var(--primary)"],[1,"info-value",2,"font-family","monospace","font-size","13px","color","var(--primary)","font-weight","700"],[1,"material-symbols-outlined",2,"color","var(--secondary)"],[1,"btn","btn-primary","btn-sm",3,"click"],["style","padding:20px;background:var(--surface-container-low);border-radius:10px;border:1.5px dashed var(--outline-variant);text-align:center;",4,"ngIf"],["style","display:flex;flex-direction:column;gap:10px;",4,"ngIf"],[1,"material-symbols-outlined",2,"color","#0284c7"],[1,"badge","primary",2,"font-size","11px"],[2,"padding","14px","background","var(--surface-container-low)","border-radius","10px","display","flex","align-items","center","gap","16px"],[2,"width","54px","height","54px","border-radius","10px","background","#ffffff","border","1px solid var(--outline-variant)","display","flex","align-items","center","justify-content","center","box-shadow","0 2px 8px rgba(0,0,0,0.05)","overflow","hidden","flex-shrink","0"],[1,"material-symbols-outlined",2,"font-size","32px","color","var(--primary)"],[2,"font-size","14px","font-weight","700","color","var(--on-surface)"],[2,"font-size","12px","color","var(--on-surface-variant)","margin-top","2px"],[1,"material-symbols-outlined",2,"color","#d97706"],[2,"padding","14px","background","var(--surface-container-low)","border","1px solid var(--outline-variant)","border-radius","10px"],[2,"display","flex","justify-content","space-between","align-items","center","margin-bottom","6px"],[2,"font-size","11px","font-weight","700","color","var(--primary)","letter-spacing","0.5px","text-transform","uppercase"],[1,"badge","secondary",2,"font-size","10px"],[2,"font-size","13.5px","font-weight","700","color","var(--on-surface)"],[2,"font-family","'JetBrains Mono',monospace","font-weight","700","color","var(--primary)"],[2,"display","flex","align-items","center","justify-content","space-between","padding-top","4px"],[2,"font-size","13px","font-weight","700","color","var(--on-surface)"],[2,"font-size","11.5px","color","var(--on-surface-variant)"],[1,"btn","btn-primary","btn-sm",3,"routerLink"],["style","width:100%;height:100%;border-radius:inherit;object-fit:cover;","alt","Logo",3,"src","error",4,"ngIf"],["alt","Logo",2,"width","100%","height","100%","border-radius","inherit","object-fit","cover",3,"error","src"],[2,"padding","20px","background","var(--surface-container-low)","border-radius","10px","border","1.5px dashed var(--outline-variant)","text-align","center"],[1,"material-symbols-outlined",2,"font-size","32px","color","var(--outline)","display","block","margin-bottom","8px"],[2,"margin","0 0 6px","font-weight","700","font-size","14px","color","var(--on-surface)"],[2,"margin","0 0 14px","font-size","12px","color","var(--on-surface-variant)"],[2,"display","flex","flex-direction","column","gap","10px"],["style","padding:12px 14px;background:var(--surface-container-lowest);border:1px solid var(--outline-variant);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;",4,"ngFor","ngForOf"],[2,"padding","12px 14px","background","var(--surface-container-lowest)","border","1px solid var(--outline-variant)","border-radius","10px","display","flex","align-items","center","justify-content","space-between","gap","12px"],[2,"display","flex","align-items","center","gap","8px"],[2,"font-weight","700","font-size","14px","color","var(--on-surface)"],[1,"badge",2,"font-size","10px","text-transform","uppercase"],[2,"font-family","monospace"],["style","font-size:11px;color:var(--on-surface-variant);margin-top:2px;",4,"ngIf"],["style","margin-top:6px;",4,"ngIf"],[2,"text-align","right"],[2,"font-size","11px","color","var(--on-surface-variant)"],["class","material-symbols-outlined","style","color:var(--primary);font-size:18px;margin-top:4px;",4,"ngIf"],["class","material-symbols-outlined","style","color:#d97706;font-size:18px;margin-top:4px;",4,"ngIf"],["class","material-symbols-outlined","style","color:#ef4444;font-size:18px;margin-top:4px;",4,"ngIf"],[2,"font-size","11px","color","var(--on-surface-variant)","margin-top","2px"],[2,"margin-top","6px"],["target","_blank",1,"btn","btn-subtle","btn-sm",2,"font-size","11px","display","inline-flex","align-items","center","gap","4px","padding","3px 8px",3,"href"],[1,"material-symbols-outlined",2,"font-size","14px"],[1,"material-symbols-outlined",2,"color","var(--primary)","font-size","18px","margin-top","4px"],[1,"material-symbols-outlined",2,"color","#d97706","font-size","18px","margin-top","4px"],[1,"material-symbols-outlined",2,"color","#ef4444","font-size","18px","margin-top","4px"],[1,"badge","primary",2,"font-size","10px"],[1,"modal-overlay",3,"click"],[1,"modal-card",2,"max-width","540px","width","100%",3,"click"],[1,"modal-header",2,"display","flex","align-items","center","justify-content","space-between","margin-bottom","18px","padding-bottom","14px","border-bottom","1px solid var(--border-subtle,#e2e8f0)"],[2,"display","flex","align-items","center","gap","12px"],[2,"width","40px","height","40px","border-radius","10px","background","rgba(0,63,135,0.08)","display","flex","align-items","center","justify-content","center","color","var(--primary,#003f87)"],[1,"material-symbols-outlined",2,"font-size","22px"],[2,"margin","0","font-size","17px","font-weight","800","color","var(--text-primary,#0f172a)"],[2,"margin","2px 0 0","font-size","12px","color","var(--text-secondary,#64748b)"],["aria-label","Close modal",1,"btn","btn-ghost","btn-sm",2,"min-width","auto","padding","6px","border-radius","8px",3,"click"],[1,"material-symbols-outlined",2,"font-size","20px"],["class","toast-notice success","style","margin-bottom:16px;",4,"ngIf"],[1,"modal-body",2,"display","flex","flex-direction","column","gap","16px"],[1,"form-label",2,"font-size","11.5px","font-weight","700","text-transform","uppercase","letter-spacing","0.5px","color","var(--text-secondary,#64748b)","margin-bottom","8px","display","block"],[2,"display","grid","grid-template-columns","repeat(3, 1fr)","gap","6px","background","var(--surface-subtle,#f1f5f9)","padding","4px","border-radius","10px","border","1px solid var(--border-subtle,#e2e8f0)"],["type","button",2,"border","none","border-radius","8px","padding","8px 6px","font-size","12px","font-weight","700","cursor","pointer","display","flex","align-items","center","justify-content","center","gap","6px","transition","all 0.15s ease",3,"click"],[2,"background","var(--surface-card,#ffffff)","border","1px solid var(--border-subtle,#cbd5e1)","border-radius","10px","padding","14px 16px"],["style","display:flex;flex-direction:column;gap:8px;font-size:12.5px;color:var(--text-secondary,#475569);",4,"ngIf"],[2,"display","grid","grid-template-columns","1fr 1fr","gap","12px"],[1,"form-group"],[1,"form-label",2,"font-size","12px"],[2,"color","var(--error,#dc2626)","font-weight","bold"],["type","text","placeholder","e.g., 50,000",1,"form-control",3,"ngModelChange","ngModel"],["type","text","placeholder","e.g., Bank Ref / TXN ID",1,"form-control",3,"ngModelChange","ngModel"],[1,"form-group",2,"margin-top","-6px"],["type","text","placeholder","e.g., Sponsorship installment for Gold Tier",1,"form-control",3,"ngModelChange","ngModel"],[1,"form-group",2,"margin-top","-4px"],["style","display:flex;align-items:center;gap:10px;",4,"ngIf"],["style","display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--surface-subtle,#f8fafc);border:1px solid var(--border-subtle,#cbd5e1);border-radius:8px;",4,"ngIf"],[2,"background","var(--surface-subtle,#f8fafc)","border","1px solid var(--border-subtle,#e2e8f0)","border-radius","8px","padding","10px 12px","display","flex","align-items","flex-start","gap","8px","font-size","11.5px","color","var(--text-secondary,#64748b)","line-height","1.4"],[1,"material-symbols-outlined",2,"font-size","15px","color","var(--primary,#003f87)","margin-top","1px"],["style","background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);color:#dc2626;padding:10px 12px;border-radius:8px;font-size:12px;margin-top:14px;",4,"ngIf"],[1,"modal-footer",2,"display","flex","justify-content","flex-end","align-items","center","gap","10px","margin-top","20px","padding-top","14px","border-top","1px solid var(--border-subtle,#e2e8f0)"],[1,"btn","btn-primary",3,"click","disabled"],[1,"toast-notice","success",2,"margin-bottom","16px"],[2,"display","flex","align-items","center","justify-content","space-between","padding-bottom","8px","border-bottom","1px solid var(--border-subtle,#e2e8f0)"],[2,"font-size","12.5px","font-weight","700","color","var(--primary,#003f87)","display","flex","align-items","center","gap","6px"],[2,"font-size","10.5px","font-weight","600","color","var(--text-muted,#64748b)","background","var(--surface-subtle,#f1f5f9)","padding","2px 8px","border-radius","4px"],[2,"display","grid","grid-template-columns","1fr auto","align-items","center","gap","12px","background","var(--surface-subtle,#f8fafc)","padding","10px 14px","border-radius","8px","border","1px dashed var(--border-subtle,#cbd5e1)"],[2,"font-size","10.5px","font-weight","600","color","var(--text-secondary,#64748b)","text-transform","uppercase","letter-spacing","0.5px"],[2,"font-size","16px","font-weight","800","font-family","'JetBrains Mono',monospace","color","var(--text-primary,#0f172a)","letter-spacing","1px","margin-top","2px"],["type","button",1,"btn","btn-subtle","btn-sm",2,"padding","6px 12px","font-size","12px","font-weight","600",3,"click"],[2,"display","grid","grid-template-columns","1fr 1fr","gap","8px","font-size","12px","color","var(--text-secondary,#64748b)","padding-top","2px"],[2,"color","var(--text-primary,#0f172a)"],[2,"display","grid","grid-template-columns","1fr 1fr","gap","10px"],[2,"background","var(--surface-subtle,#f8fafc)","padding","10px 12px","border-radius","8px","border","1px dashed var(--border-subtle,#cbd5e1)","display","flex","justify-content","space-between","align-items","center"],[2,"font-size","10px","font-weight","600","color","var(--text-secondary,#64748b)","text-transform","uppercase"],[2,"font-size","14px","font-weight","800","font-family","'JetBrains Mono',monospace","color","var(--text-primary,#0f172a)"],["type","button",1,"btn","btn-ghost","btn-sm",2,"padding","4px 6px",3,"click"],[2,"font-size","11.5px","color","var(--text-secondary,#64748b)"],[2,"display","flex","flex-direction","column","gap","8px","font-size","12.5px","color","var(--text-secondary,#475569)"],[2,"font-weight","700","color","var(--primary,#003f87)","display","flex","align-items","center","gap","6px"],[2,"font-size","11.5px","color","var(--text-muted,#64748b)"],["type","file","accept","image/*,application/pdf",2,"display","none",3,"change"],["type","button",1,"btn","btn-subtle","btn-sm",2,"display","inline-flex","align-items","center","gap","6px",3,"click","disabled"],[2,"display","flex","align-items","center","justify-content","space-between","padding","8px 12px","background","var(--surface-subtle,#f8fafc)","border","1px solid var(--border-subtle,#cbd5e1)","border-radius","8px"],[1,"material-symbols-outlined",2,"color","var(--primary,#003f87)","font-size","18px"],[2,"font-size","12px","font-weight","600","color","var(--text-primary,#0f172a)"],[2,"display","flex","align-items","center","gap","6px"],["target","_blank",1,"btn","btn-ghost","btn-sm",2,"padding","2px 8px","font-size","11px",3,"href"],["type","button",1,"btn","btn-ghost","btn-sm",2,"padding","2px 8px","color","var(--error,#dc2626)","font-size","11px",3,"click"],[2,"background","rgba(239,68,68,0.08)","border","1px solid rgba(239,68,68,0.3)","color","#dc2626","padding","10px 12px","border-radius","8px","font-size","12px","margin-top","14px"],[1,"page-header","with-action"],[1,"page-title-main"],[1,"page-subtitle"],[1,"stat-grid",2,"grid-template-columns","repeat(4,1fr)"],[1,"stat-value"],[1,"stat-value",2,"font-size","24px"],["class","card","style","margin-top:24px;",4,"ngIf"],[2,"display","flex","flex-direction","column","gap","16px","margin-top","24px"],["style","text-align:center;padding:48px;border-radius:12px;background:var(--surface-container-low);border:2px dashed var(--outline-variant);color:var(--on-surface-variant);",4,"ngIf"],["class","card",4,"ngFor","ngForOf"],[1,"card",2,"margin-top","24px"],[2,"margin","0","font-size","16px","font-weight","700"],[1,"badge"],[1,"card-body"],["style","text-align:center;padding:24px;color:var(--on-surface-variant);",4,"ngIf"],["style","text-align:center;padding:24px;color:var(--on-surface-variant);font-size:13px;",4,"ngIf"],["style","display:flex;flex-direction:column;gap:12px;",4,"ngIf"],[2,"text-align","center","padding","24px","color","var(--on-surface-variant)"],[2,"text-align","center","padding","24px","color","var(--on-surface-variant)","font-size","13px"],[1,"material-symbols-outlined",2,"font-size","32px","color","var(--outline)","display","block","margin-bottom","6px"],[2,"display","flex","flex-direction","column","gap","12px"],["style","padding:14px;background:var(--surface-container-lowest);border:1px solid var(--outline-variant);border-radius:10px;display:flex;align-items:center;justify-content:space-between;gap:16px;",4,"ngFor","ngForOf"],[2,"padding","14px","background","var(--surface-container-lowest)","border","1px solid var(--outline-variant)","border-radius","10px","display","flex","align-items","center","justify-content","space-between","gap","16px"],[2,"font-weight","700","font-size","15px","color","var(--on-surface)"],[1,"badge","secondary",2,"font-size","10px","text-transform","uppercase"],[1,"badge","warn",2,"font-size","10px"],["style","font-size:12px;color:var(--on-surface-variant);margin-top:2px;",4,"ngIf"],[2,"display","flex","align-items","center","gap","8px","flex-shrink","0"],[1,"btn","btn-primary","btn-sm",3,"click","disabled"],[1,"btn","btn-subtle","btn-sm",2,"color","#ef4444",3,"click","disabled"],[2,"text-align","center","padding","48px","border-radius","12px","background","var(--surface-container-low)","border","2px dashed var(--outline-variant)","color","var(--on-surface-variant)"],[1,"material-symbols-outlined",2,"font-size","48px","color","var(--outline)","display","block","margin-bottom","8px"],[2,"margin","0","font-weight","600"],[2,"margin","6px 0 0 0","font-size","13px"],[1,"card-body",2,"display","flex","align-items","center","gap","16px"],[2,"width","52px","height","52px","border-radius","12px","background","rgba(0,63,135,0.1)","display","flex","align-items","center","justify-content","center","font-size","22px","font-weight","900","flex-shrink","0","color","var(--primary)"],[2,"flex","1"],[2,"display","flex","align-items","center","gap","8px","margin-bottom","4px"],[2,"font-weight","700","font-size","16px"],[1,"badge","secondary",2,"font-size","11px"],[2,"font-size","13px","color","var(--on-surface-variant)"],[2,"font-size","12px","font-family","'JetBrains Mono',monospace","font-weight","700","color","#ffffff","background","var(--primary,#003f87)","padding","4px 12px","border-radius","6px","letter-spacing","0.5px"],[1,"modal-card",2,"max-width","500px","width","100%",3,"click"],[1,"modal-header",2,"display","flex","align-items","center","justify-content","space-between","margin-bottom","16px"],[1,"material-symbols-outlined",2,"color","var(--primary)","font-size","24px"],[2,"margin","0","font-size","18px","font-weight","800"],[1,"btn","btn-ghost","btn-sm",2,"min-width","auto","padding","4px",3,"click"],[1,"modal-body",2,"display","flex","flex-direction","column","gap","14px"],[2,"display","flex","align-items","center","justify-content","space-between","margin-bottom","4px"],[1,"form-label",2,"margin","0"],[2,"display","inline-flex","align-items","center","gap","4px","font-size","11px","color","var(--text-muted,#94a3b8)","font-weight","600"],[1,"material-symbols-outlined",2,"font-size","13px"],["type","text","readonly","","disabled","",1,"form-control",2,"background","var(--surface-subtle,#f8fafc)","cursor","not-allowed","color","var(--text-secondary,#64748b)",3,"value"],[1,"form-label",2,"font-weight","700"],["type","tel","placeholder","e.g., 0201880325",1,"form-control",3,"ngModelChange","ngModel"],[2,"font-size","11.5px","color","var(--text-muted,#64748b)","margin-top","4px"],[2,"background","var(--surface-subtle,#f8fafc)","border","1px solid var(--border-subtle,#e2e8f0)","border-radius","8px","padding","10px 12px","display","flex","align-items","flex-start","gap","8px","font-size","12px","color","var(--text-secondary,#64748b)","line-height","1.4"],[1,"material-symbols-outlined",2,"font-size","16px","color","var(--primary,#003f87)","margin-top","1px"],[1,"modal-footer",2,"display","flex","justify-content","flex-end","gap","10px","margin-top","20px"]],template:function(s,a){s&1&&(n(0,"div",1),u(1,Be,204,32,"ng-container",2)(2,Ke,53,10,"ng-container",2)(3,tt,66,9,"div",3),t()),s&2&&(o(),l("ngIf",a.isSponsorLoggedIn),o(),l("ngIf",!a.isSponsorLoggedIn),o(),l("ngIf",a.isEditProfileModalOpen))},dependencies:[K,H,q,J,X,Y,re,ne,ie,oe,Z,Q],styles:['@charset "UTF-8";[_nghost-%COMP%]{display:flex;flex-direction:column;flex:1;min-height:0}.sponsor-hero-banner[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:24px 28px;margin-bottom:24px;background:linear-gradient(135deg,var(--surface-container-high) 0%,var(--surface-container) 100%);border:1.5px solid var(--primary-container);border-radius:16px;flex-wrap:wrap}.sponsor-hero-left[_ngcontent-%COMP%]{display:flex;align-items:center;gap:18px}.sponsor-avatar[_ngcontent-%COMP%]{width:68px;height:68px;border-radius:16px;background:var(--primary);color:var(--on-primary);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;flex-shrink:0;overflow:hidden;box-shadow:0 4px 14px #00000026}.sponsor-hero-badges[_ngcontent-%COMP%]{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}.sponsor-token[_ngcontent-%COMP%]{font-size:11.5px;font-weight:700;color:#fff;background:var(--primary, #003f87);padding:4px 12px;border-radius:6px;font-family:JetBrains Mono,monospace;letter-spacing:.75px;display:inline-flex;align-items:center}body.dark-theme[_nghost-%COMP%]   .sponsor-token[_ngcontent-%COMP%], body.dark-theme   [_nghost-%COMP%]   .sponsor-token[_ngcontent-%COMP%]{color:#fff;background:#1d4ed8}.sponsor-hero-title[_ngcontent-%COMP%]{margin:0 0 4px;font-size:22px;font-weight:800;color:var(--on-surface);line-height:1.2}.sponsor-hero-sub[_ngcontent-%COMP%]{margin:0;font-size:13px;color:var(--on-surface-variant)}.sponsor-hero-actions[_ngcontent-%COMP%]{display:flex;gap:10px;flex-shrink:0}.info-row[_ngcontent-%COMP%]{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--outline-variant)}.info-row[_ngcontent-%COMP%]:last-child{border-bottom:none}.info-label[_ngcontent-%COMP%]{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:var(--on-surface-variant);flex-shrink:0}.info-value[_ngcontent-%COMP%]{font-size:14px;font-weight:500;color:var(--on-surface);text-align:right}.modal-overlay[_ngcontent-%COMP%]{position:fixed;inset:0;background:#0f172aa6;-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;box-sizing:border-box}.modal-card[_ngcontent-%COMP%]{background:var(--surface-container-lowest, #ffffff);border-radius:16px;border:1px solid var(--outline-variant, #e2e8f0);box-shadow:0 25px 50px -12px #00000040;padding:24px 28px;max-width:540px;width:100%;max-height:90vh;overflow-y:auto;animation:_ngcontent-%COMP%_modalPop .2s cubic-bezier(.16,1,.3,1);box-sizing:border-box}@keyframes _ngcontent-%COMP%_modalPop{0%{opacity:0;transform:scale(.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}@media (max-width: 900px){.page-canvas[_ngcontent-%COMP%] > ng-container[_ngcontent-%COMP%] > div[style*="grid-template-columns:1fr 1fr"][_ngcontent-%COMP%]{grid-template-columns:1fr!important}}@media (max-width: 768px){.sponsor-hero-banner[_ngcontent-%COMP%]{flex-direction:column;align-items:flex-start}.stat-grid[_ngcontent-%COMP%]{grid-template-columns:repeat(2,1fr)!important}}@media (max-width: 480px){.stat-grid[_ngcontent-%COMP%]{grid-template-columns:1fr!important}.sponsor-hero-title[_ngcontent-%COMP%]{font-size:18px}}'],changeDetection:0})}}return r})();export{xt as SponsorsComponent};
