const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Brand  = require("../../models/brandSchema");
const Banner = require("../../models/bannerSchema");

const nodemailer = require("nodemailer");
const env = require("dotenv").config();
const bcrypt = require("bcrypt");



//signup load
const loadSignup = async(req,res) => {
    try{
        return res.render("signup");
    }catch(error){
        console.log("home page not loading:",error);
        res.status(500).send("server Error");
    }
} 




const pageNotFound = async(req,res) => {
     try{
        res.render("page_404");
     }catch(error){
        res.redirect("/pageNotFound");
     }
}


// home page
const loadHomepage = async (req, res) => {
    try {

        // Extract user session and fetch listed category
        const user = req.session.user;
        const categories = await Category.find({isListed:true});

         // Fetch unblocked products with stock, belonging to listed categories
        let productData = await Product.find(
            {
                isBlocked:false,
                category:{$in:categories.map(category=>category._id)},quantity:{$gt:0}
            }
        )
   
        productData.sort((a,b)=> new Date(b.createdOn)-new Date(a.createdOn));  //latest added product
        productData = productData.slice(0,4);  // limits first 4 products

        // If a user is logged in, fetch their details 
        if (user) {

            const userData = await User.findOne({_id:user._id});
            res.render("home", { user:userData,products:productData });
        
        } else {
            res.render("home",{products:productData});
        }
    } catch (error) {
        console.error("Homepage error:", error);
        res.status(500).send("Server error");
    }
};









// generate otp
function generateOtp(){
    return Math.floor(100000 + Math.random()*900000).toString();
}



// send verification email
async function sendVerificationEmail(email,otp){
    try{

        // Create a transporter
       const transporter = nodemailer.createTransport({
          service:"gmail",
          port:587,
          secure:false, // Use TLS
          requireTLS:true,
          auth:{
            user:process.env.NODEMAILER_EMAIL,
            pass:process.env.NODEMAILER_PASSWORD
          }
       })

       // Send the email
       const info = await transporter.sendMail({
           from:process.env.NODEMAILER_EMAIL,
           to: email,
           subject:"Verify your account",
           text:`Your OTP is ${otp}`,
           html:`<b>Your OTP : ${otp}</b>`,
       })
       //contains email address if success
       return info.accepted.length > 0


    }catch(error){
       console.error("Error sending email",error);
       return false;
    } 
}


//signup verification
const signup = async(req,res) => {
    try{
        
        const {name,phone,email,password,cPassword} = req.body;
        if(password != cPassword){
            return res.render("signup",{message:"Password dont match"});
        }

        const findUser = await User.findOne({email});
        if(findUser){
            return res.render("signup",{message:"User with this email already exist"});

        }
        const otp = generateOtp();
        
        const emailSend = await sendVerificationEmail(email,otp);
        if(!emailSend){
            // return res.json("email.error");
            return res.render("signup", { message: "Failed to send verification email. Please try again." });

        }

        

        req.session.userOtp = otp;
        req.session.userData = {name,phone,email,password};

        res.render("verify-otp");
        console.log("OTP Sent",otp);
    
    }catch(error){
        console.error("signup error",error);
        res.redirect("/pageNotfound");
    }
}

const securePassword = async(password)=>{
    try{
       const passwordHash = await bcrypt.hash(password,10);
       return passwordHash;
    }catch(error){
        console.error("Error hashing password:", error);
        throw error; // Propagate the error to handle it upstream
    }
}

//verify otp
const verifyOtp = async(req,res)=>{
    try{
       const {otp} = req.body;
       console.log(otp);

        // Check if the OTP matches the one in the session
       if(otp===req.session.userOtp){
           const user = req.session.userData;
           const passwordHash = await securePassword(user.password);
      
            // Data saved in database
           const saveUserData = new User({
              name:user.name,
              email:user.email,
              phone:user.phone,
              password:passwordHash,
           })
           await saveUserData.save();

           req.session.user = saveUserData.id;
           
           //clean user data and otp after login
           req.session.userOtp = null;
           req.session.userData = null;


           res.json({success:true,redirectUrl:"/"});
        }else{
            res.status(400).json({success:false,message:"Invalid OTP, Please try again "});
        }
    }catch(error){
        console.error("Error Verifying OTP",error);
        res.status(500).json({success:false,message:"An error occured"});
    }
}

const resendOtp = async(req,res)=>{
    try{

        // Check if the session contains the user data and email
       const {email} = req.session.userData;
       if(!email){
         return res.status(400).json({success:false,message:"Email not found in session"});
       }
       
       const otp = generateOtp();
       req.session.userOtp = otp;
       
       const emailSend = await sendVerificationEmail(email,otp);
       if(emailSend){
        console.log("Resend OTP:",otp);
        res.status(200).json({success:true,message:"OTP Resend Successfully"});
       }else{
         res.status(500).json({success:false,message:"Failed to resend OTP, Try again"});
       }

    }catch(error){
       console.error("Error resending OTP",error);
       res.status(500).json({success:false,message:"Internal Server Error, Try again"});
    }
}


const loadLogin = async(req,res)=>{
    try{
       
         // Check if the user is already logged in by verifying the session
       if(!req.session.user){
         return res.render("login");
       }else{
         res.redirect("/");
       }

    }catch(error){
        console.error("Error loading login page:", error);
        res.redirect("pageNotFound");
    }
}


const login = async(req,res)=>{
    try{

        // Find the user in the database who matches the email and is not an admin
       const {email,password} = req.body;
       const findUser = await User.findOne({isAdmin:0,email:email});
       
       if(!findUser){
          return res.render("login",{message:"User not found"});
       }
       if(findUser.isBlocked){
        return res.render("login",{message:"User is blocked by admin"});
       }
        

        // Compare the provided password with the stored hashed password
       const passwordMatch = await bcrypt.compare(password,findUser.password);
       if(!passwordMatch){
        return res.render("login",{message:"Incorrect Password"});
       }

    
        // If login is successful, store user data in the session
          req.session.user = {
                 _id: findUser._id,
                  name: findUser.name,
                  email: findUser.email
                };


       res.redirect("/");   // Redirect to homepage after successful login

    }catch(error){
       console.error("login error",error);
       res.render("login",{message:"Login failed. Please try again later"});
    }
}


const logout = async(req,res)=>{
    try {
        
        // Destroy the session to log out the user
        req.session.destroy((err)=>{
           if(err){
            console.log("Session destuction error",err.message);
            return res.redirect("/pageNotFound");
           }
           return res.redirect("/");
        })
       
    } catch (error) {
        
        console.log("logout error",error);
        res.redirect("/pageNotFound");
    }
}


const loadShoppingPage = async(req,res)=>{
    try {
        
         // Fetch user data from session
        const user = req.session.user;
        const userData = await User.findOne({_id:user});

        // Fetch all categories that are listed (active)
        const categories = await Category.find({isListed:true});
        const categoryIds = categories.map((category)=>category._id.toString());

         // Pagination logic products in a page and skip products from previous page
        const page = parseInt(req.query.page)||1;
        const limit = 8;           
        const skip = (page-1)*limit;

        // Fetch the products with the given filters (not blocked, available quantity, within categories)
        const products = await Product.find({
            isBlocked:false,
            category:{$in:categoryIds},
            quantity:{$gt:0}            
        }).sort({createdOn:-1}).skip(skip).limit(limit);



         // Count the total number of products that match the criteria
        const totalProducts = await Product.countDocuments({
            isBlocked:false,
            category:{$in:categoryIds},
            quantity:{$gt:0}
        });
        const totalPages = Math.ceil(totalProducts/limit);
        const brands = await Brand.find({isBlocked:false});

        // Prepare categories with only their _id and name for easier rendering in the view
        const categoriesWithIds = categories.map(category => ({_id:category._id,name:category.name}));

         // Render the shop page and pass the necessary data
        res.render("shop",{
            user:userData,
            products:products,
            category:categoriesWithIds,
            brand:brands,
            totalProducts:totalProducts,
            currentPage:page,
            totalPages:totalPages

        });

    } catch (error) {
        
        res.redirect("/pageNotFound");
    }
}



const filterProduct = async(req,res)=>{
    try {
        
        console.log('Query parameters:', req.query); // Log all query parameters
        const user = req.session.user;
        const category = req.query.category;
        const brand = req.query.brand;
      
        
        const findCategory = category ? await Category.findOne({_id:category}):null;
        const findBrand = brand ? await Brand.findOne({_id:brand}):null;
        const brands = await Brand.find({}).lean();
        const query = {
            isBlocked:false,
            quantity:{$gt:0}
        }

        if(findCategory){
            query.category = findCategory._id;
        }

        if(findBrand){
            query.brand = findBrand.brandName;
        }

       

        let findProducts = await Product.find(query).lean();
        findProducts.sort((a,b)=>new Date(b.createdOn)-new Date(a.createdOn));

        const categories = await Category.find({isListed:true});
        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage-1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length/itemsPerPage);
        const currentProduct = findProducts.slice(startIndex,endIndex);
        let userData = null;
        if(user){
            userData = await User.findOne({_id:user});
            if(userData){
                const searchEntry = {
                    category : findCategory ? findCategory._id:null,
                    brand : findBrand ? findBrand.brandName : null,
                   
                    searchOn : new Date()
                } 
                userData.searchHistory.push(searchEntry);
                await userData.save();
            }
        }

        req.session.filteredProducts = currentProduct;

        res.render("shop",{
            user : userData,
            products : currentProduct,
            category : categories,
            brand : brands,
            totalPages,
            currentPage,
            selectedCategory : category || null,
            selectedBrand : brand || null,
           

        })

    } catch (error) {
        
        res.redirect("/pageNotFound");

    }
}


const filterByPrice = async(req,res)=>{
    try {
        
        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        const brands = await Brand.find({}).lean();
        const categories = await Category.find({isListed:true}).lean();

        let findProducts = await Product.find({
            salePrice : {$gt:req.query.gt,$lt:req.query.lt},
            isBlocked : false,
            quantity : {$gt:0}
        }).lean();

        findProducts.sort((a,b)=>new Date(b.createdOn)-new Date(a.createdOn));

        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage-1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length/itemsPerPage);
        const currentProduct = findProducts.slice(startIndex,endIndex);
        req.session.filteredProducts = findProducts;
        
        res.render("shop",{

            user : userData,
            products : currentProduct,
            category : categories,
            brand : brands,
            totalPages,
            currentPage,
        })

    } catch (error) {
        
        console.log(error);
        res.redirect("/pageNotFound");
    }
}



const searchProducts = async(req,res)=>{
    try {
        // console.log("Search Query:", req.body.query);
        // console.log("Request Body:", req.body);

        const user = req.session.user;
        const userData = await User.findOne({_id:user});
        let search = req.body.query;
        


        const brands = await Brand.find({}).lean();
        const categories = await Category.find({isListed:true}).lean();
        const categoryIds = categories.map(category=>category._id.toString());
        let searchResult = [];
        if(req.session.filteredProducts && req.session.filteredProducts.length > 0){
            searchResult = req.session.filteredProducts.filter(product=>
                product.productName.toLowerCase().includes(search.toLowerCase())

            )
        }else{
            searchResult = await Product.find({
                productName : {$regex:".*"+search+".*",$options:"i"},
                isBlocked : false,
                quantity : {$gt:0},
                category : {$in:categoryIds}
            })
        }

        searchResult.sort((a,b)=> new Date(b.createdOn) - new Date(a.createdOn));
        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage-1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(searchResult.length/itemsPerPage);
        const currentProduct = searchResult.slice(startIndex,endIndex);
        res.render("shop",{

            user : userData,
            products : currentProduct,
            category : categories,
            brand : brands,
            totalPages,
            currentPage,
            count : searchResult.length,
        })

    } catch (error) {
        
       console.log("Error : ",error);
       res.redirect("/pageNotFound");

    }
}




module.exports = {
    loadHomepage,
    pageNotFound,
    loadSignup,
    signup,
    verifyOtp,
    resendOtp,
    loadLogin,
    login,
    logout,
    loadShoppingPage,
    filterProduct,
    filterByPrice,
    searchProducts,
};