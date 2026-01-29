const video = document.getElementById("video");
const canvas = document.getElementById("mesh");
const msgDiv = document.getElementById("msg");

// ---------------- Start camera ----------------
async function startCamera(video) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        return new Promise(resolve => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });
    } catch (err) {
        alert("Cannot access camera. Check permissions!");
        console.error(err);
    }
}

// ---------------- Capture image ----------------
function captureImage(video) {
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d").drawImage(video, 0, 0);
    return c.toDataURL("image/jpeg");
}

// ---------------- Live face tracking ----------------
function startLiveTracking(video, canvas) {
    async function track() {
        if (video.videoWidth === 0) { 
            requestAnimationFrame(track); 
            return; 
        }
        const img = captureImage(video);
        try {
            const res = await fetch("/api/landmarks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: img })
            });
            const data = await res.json();
            if (data.landmarks) drawMesh(canvas, data.landmarks);
            else canvas.getContext("2d").clearRect(0,0,canvas.width,canvas.height);
        } catch(e) { console.log(e); }
        setTimeout(() => requestAnimationFrame(track), 100); // ~10 FPS
    }
    track();
}

// ---------------- Draw mesh ----------------
function drawMesh(canvas, landmarks) {
    const video = canvas.parentElement.querySelector("video");
    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0,0,canvas.width,canvas.height);

    let pts = [];
    Object.values(landmarks).forEach(arr => arr.forEach(p => pts.push(p)));

    // Draw glowing points
    pts.forEach(p => {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 3, 0, Math.PI*2);
        ctx.fillStyle = "rgba(0,255,255,0.9)";
        ctx.shadowBlur = 12;
        ctx.shadowColor = "cyan";
        ctx.fill();
    });
    ctx.shadowBlur = 0;

    // Connect nearby points
    for (let i=0;i<pts.length;i++){
        for(let j=i+1;j<pts.length;j++){
            const dx=pts[i][0]-pts[j][0];
            const dy=pts[i][1]-pts[j][1];
            const dist = Math.sqrt(dx*dx + dy*dy);
            if(dist<70){
                ctx.beginPath();
                ctx.moveTo(pts[i][0],pts[i][1]);
                ctx.lineTo(pts[j][0],pts[j][1]);
                ctx.strokeStyle = `rgba(0,255,200,${1-dist/70})`;
                ctx.lineWidth=1;
                ctx.stroke();
            }
        }
    }
}

// ---------------- Show popup ----------------
function showMsg(text, type="success") {
    msgDiv.innerText = text;

    // Reset classes
    msgDiv.className = "msg-popup";

    // Add type class
    if(type === "success") msgDiv.classList.add("success");
    else msgDiv.classList.add("error");

    // Show popup
    msgDiv.classList.add("show");

    // Hide after 3 seconds
    setTimeout(() => {
        msgDiv.classList.remove("show");
    }, 3000);
}

// ---------------- Login ----------------
async function doLogin() {
    const username = document.getElementById("username").value.trim();
    if(!username){ 
        showMsg("Username is required!", "error"); 
        return; 
    }

    const img = captureImage(video);

    try {
        const res = await fetch("/api/login", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({username, image: img})
        });
        const data = await res.json();

        if(data.status==="success"){
            showMsg("Login successful!", "success");
            if(video.srcObject) video.srcObject.getTracks().forEach(t=>t.stop());
            setTimeout(()=>window.location.href="/dashboard",1200);
        } else {
            showMsg(data.message || "Login failed", "error");
        }
    } catch(e){
        console.log(e);
        showMsg("Something went wrong", "error");
    }
}

// ---------------- Initialize ----------------
(async()=>{
    await startCamera(video);
    startLiveTracking(video, canvas);
})();
