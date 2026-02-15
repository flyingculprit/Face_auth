const video = document.getElementById("video");
const canvas = document.getElementById("mesh");
const msgDiv = document.getElementById("msg");

let eyeClosed = false;
let blinkImage = null;   // store frame when blink happens

const EAR_THRESHOLD = 0.20;

// ---------------- Start camera ----------------
async function startCamera(video){
    const stream = await navigator.mediaDevices.getUserMedia({video:true});
    video.srcObject = stream;
    return new Promise(resolve=>{
        video.onloadedmetadata=()=>{video.play();resolve();}
    });
}

// ---------------- Capture image ----------------
function captureImage(){
    const c=document.createElement("canvas");
    c.width=video.videoWidth;
    c.height=video.videoHeight;
    c.getContext("2d").drawImage(video,0,0);
    return c.toDataURL("image/jpeg");
}

// ---------------- Calculate EAR ----------------
function calculateEAR(eye){
    const dist = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
    const A = dist(eye[1], eye[5]);
    const B = dist(eye[2], eye[4]);
    const C = dist(eye[0], eye[3]);
    return (A+B) / (2.0*C);
}

// ---------------- Live tracking + Secure Blink ----------------
async function startLiveTracking(){
    async function track(){
        if(video.videoWidth===0){
            requestAnimationFrame(track);
            return;
        }

        const img = captureImage();

        try{
            const res = await fetch("/api/landmarks",{
                method:"POST",
                headers:{"Content-Type":"application/json"},
                body:JSON.stringify({image:img})
            });

            const data = await res.json();

            if(data.landmarks){
                drawMesh(data.landmarks);

                const leftEAR = calculateEAR(data.landmarks.left_eye);
                const rightEAR = calculateEAR(data.landmarks.right_eye);
                const avgEAR = (leftEAR + rightEAR)/2;

                // Eye closed
                if(avgEAR < EAR_THRESHOLD){
                    eyeClosed = true;
                }

                // Blink complete → capture THIS frame immediately
                if(avgEAR > EAR_THRESHOLD && eyeClosed){
                    blinkImage = img;  // store blink frame
                    eyeClosed = false;
                    showMsg("Blink detected ✔ Now click Login","success");
                }
            }

        }catch(e){
            console.log(e);
        }

        setTimeout(()=>requestAnimationFrame(track),100);
    }

    track();
}

// ---------------- Draw mesh ----------------
function drawMesh(landmarks){
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);

    let pts=[];
    Object.values(landmarks).forEach(arr=>arr.forEach(p=>pts.push(p)));

    pts.forEach(p=>{
        ctx.beginPath();
        ctx.arc(p[0],p[1],3,0,2*Math.PI);
        ctx.fillStyle="rgba(0,255,255,0.9)";
        ctx.shadowBlur=12;
        ctx.shadowColor="cyan";
        ctx.fill();
    });

    ctx.shadowBlur=0;
}

// ---------------- Show popup ----------------
function showMsg(text,type="success"){
    msgDiv.innerText=text;
    msgDiv.className="msg-popup";
    msgDiv.classList.add(type,"show");
    setTimeout(()=>msgDiv.classList.remove("show"),3000);
}

// ---------------- Login ----------------
async function doLogin(){
    const username=document.getElementById("username").value.trim();

    if(!username){
        showMsg("Username required","error");
        return;
    }

    if(!blinkImage){
        showMsg("Please blink first!","error");
        return;
    }

    try{
        const res=await fetch("/api/login",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({username,image:blinkImage})
        });

        const data=await res.json();

        if(data.status==="success"){
            showMsg("Login successful!","success");
            video.srcObject.getTracks().forEach(t=>t.stop());
            setTimeout(()=>window.location.href="/dashboard",1200);
        }else{
            showMsg(data.message || "Login failed","error");
        }

        // Reset blink after attempt
        blinkImage = null;

    }catch(e){
        console.log(e);
        showMsg("Something went wrong","error");
        blinkImage = null;
    }
}

// ---------------- Init ----------------
(async()=>{
    await startCamera(video);
    startLiveTracking();
})();
